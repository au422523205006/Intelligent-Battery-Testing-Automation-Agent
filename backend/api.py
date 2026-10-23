"""
backend/api.py - FastAPI Backend Service for EV Battery Monitoring and Intelligent Control Agent.

Serves RESTful APIs for:
- Live battery pack telemetry and simulator control
- Historical and imported uPowerful BST / BettaTeQ test sessions
- Natural-language multi-LLM chatbot with safe fallback and data provenance
- uPowerful BST automated sync and file upload
- PDF test report generation and download
"""

import os
import sys
import shutil
import tempfile
from typing import Dict, Any, List, Optional
from datetime import datetime

# Ensure root directory is on PYTHONPATH
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi import FastAPI, HTTPException, UploadFile, File, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from database import (
    init_db,
    create_session,
    update_session_status,
    get_latest_measurement_record,
    get_test_sessions_list,
    get_test_session_detail,
    get_test_measurements_list,
    get_pack_summary,
    PROVENANCE_SIMULATED,
    PROVENANCE_STORED_UNVERIFIED,
    PROVENANCE_IMPORTED_REPORT,
    PROVENANCE_UNAVAILABLE,
)
from agent import chat_with_agent, router, bms_adapter, generate_battery_report
from simulator import BatterySimulator
from backend.connectors.upowerful_connector import UPowerfulConnector

# Initialize DB on startup
init_db()

app = FastAPI(
    title="EV Battery Monitoring & Intelligent Control API",
    version="2.0.0",
    description="Backend API powering React dashboard with Multi-LLM chatbot and uPowerful BST integration."
)

# Enable CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins in local lab/dev environment
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# uPowerful connector instance
upowerful_connector = UPowerfulConnector()

# Simulator state
active_sim: Optional[BatterySimulator] = None
active_sim_session_id: Optional[int] = None


# --- Request/Response Models ---
class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, description="User query or command")
    conversation_history: Optional[List[Dict[str, str]]] = Field(default=None, description="Previous messages")

class ChatResponse(BaseModel):
    reply: str
    active_provider: str
    active_model: str
    fallback_occurred: bool
    fallback_reason: Optional[str] = None
    attempted_providers: List[str]
    diagnostics: Dict[str, Any]
    tool_calls_executed: List[str]

class SimulatorStartRequest(BaseModel):
    mode: str = Field(default="CHARGE", description="CHARGE or DISCHARGE")
    current_amps: float = Field(default=50.0, ge=1.0, le=250.0)
    initial_soc: float = Field(default=50.0, ge=0.0, le=100.0)
    capacity_ah: float = Field(default=100.0, ge=10.0, le=500.0)


# --- Health & Status Endpoints ---
@app.get("/api/health")
def get_health():
    """Health check endpoint returning system component status."""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "hardware_status": "DISCONNECTED",
        "hardware_control": "LOCKED",
        "database": "sqlite_ready",
        "upowerful_connector": upowerful_connector.get_status().get("bridge_available", False),
        "active_primary_llm": router.config.primary_llm
    }


@app.get("/api/battery/status")
def get_battery_status_endpoint():
    """Returns the latest battery telemetry and hardware state."""
    summary = get_pack_summary()
    latest = summary.get("latest_telemetry")
    return {
        "hardware_status": "DISCONNECTED",
        "hardware_message": "Physical BMS/battery hardware is not connected. Telemetry is simulated or stored lab data.",
        "active_mode": "MOCK_SIMULATOR" if (active_sim and active_sim.is_running) else "IDLE",
        "pack_spec": summary.get("pack", {}),
        "telemetry": latest or {
            "voltage": 0.0,
            "current": 0.0,
            "temperature": 25.0,
            "soc": 0.0,
            "provenance": PROVENANCE_UNAVAILABLE,
            "timestamp": None
        }
    }


@app.get("/api/pack/summary")
def get_pack_summary_endpoint():
    """Returns full pack specification and latest telemetry."""
    return get_pack_summary()


# --- Test Management Endpoints ---
@app.get("/api/tests")
def list_tests(
    search: Optional[str] = Query(default=None, description="Search term for test name, procedure, or batch"),
    provenance: Optional[str] = Query(default=None, description="Filter by provenance (IMPORTED_REPORT, SIMULATED, etc.)"),
    limit: int = Query(default=50, ge=1, le=200)
):
    """Returns a list of test sessions with summary metrics."""
    sessions = get_test_sessions_list(search=search, limit=limit)
    if provenance:
        sessions = [s for s in sessions if s.get("provenance") == provenance]
    return {
        "total": len(sessions),
        "tests": sessions
    }


@app.get("/api/tests/latest")
def get_latest_test():
    """Returns details for the latest test session."""
    sessions = get_test_sessions_list(limit=1)
    if not sessions:
        raise HTTPException(status_code=404, detail="No test sessions found.")
    detail = get_test_session_detail(sessions[0]["id"])
    return detail


@app.get("/api/tests/{test_id}")
def get_test_detail(test_id: int):
    """Returns detailed session header and statistics for a given test ID."""
    detail = get_test_session_detail(test_id)
    if not detail:
        raise HTTPException(status_code=404, detail=f"Test session #{test_id} not found.")
    return detail


@app.get("/api/tests/{test_id}/measurements")
def get_test_measurements(test_id: int, max_points: int = Query(default=500, ge=50, le=2000)):
    """Returns downsampled time-series measurements for a test session."""
    detail = get_test_session_detail(test_id)
    if not detail:
        raise HTTPException(status_code=404, detail=f"Test session #{test_id} not found.")
    records = get_test_measurements_list(test_id, max_points=max_points)
    return {
        "session_id": test_id,
        "test_name": detail.get("test_name"),
        "provenance": detail.get("provenance"),
        "total_points_returned": len(records),
        "records": records
    }


@app.get("/api/tests/{test_id}/report")
def download_test_report(test_id: int):
    """Generates and serves a PDF test report."""
    detail = get_test_session_detail(test_id)
    if not detail:
        raise HTTPException(status_code=404, detail=f"Test session #{test_id} not found.")

    from report_generator import generate_pdf_report
    battery_info = {
        'name': detail.get('test_name', f'Session #{test_id}'),
        'nominal_voltage': detail.get('max_voltage', 400.0) or 400.0,
        'capacity_ah': detail.get('capacity_ah', 100.0) or 100.0,
        'chemistry': 'Li-Ion',
        'provenance': detail.get('provenance', PROVENANCE_STORED_UNVERIFIED),
        'hardware_status': 'DISCONNECTED'
    }
    pdf_path = generate_pdf_report(test_id, battery_info)
    if not os.path.isfile(pdf_path):
        raise HTTPException(status_code=500, detail="Failed to generate PDF report file.")

    return FileResponse(
        pdf_path,
        media_type="application/pdf",
        filename=os.path.basename(pdf_path)
    )


# --- uPowerful BST Integration Endpoints ---
@app.get("/api/upowerful/status")
def get_upowerful_status():
    """Returns connector status, detected files, and sync statistics."""
    return upowerful_connector.get_status()


@app.post("/api/upowerful/sync")
def sync_upowerful_files(max_files: int = Query(default=20, ge=1, le=100)):
    """Triggers automated scanning and ingestion of uPowerful BST .main files."""
    result = upowerful_connector.scan_and_sync(max_files=max_files)
    return result


@app.post("/api/upowerful/import")
async def import_upowerful_file(file: UploadFile = File(...)):
    """Allows manual upload of a .main or .csv file from laboratory workstation."""
    filename = file.filename or "uploaded_test.main"
    ext = os.path.splitext(filename)[1].lower()
    if ext not in [".main", ".csv", ".tsv"]:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format: {ext}. Allowed formats: .main, .csv"
        )

    # Save to a temporary file
    temp_dir = tempfile.mkdtemp()
    temp_path = os.path.join(temp_dir, filename)
    try:
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        session_id = upowerful_connector.import_single_file(temp_path)
        detail = get_test_session_detail(session_id)
        return {
            "status": "success",
            "message": f"Successfully imported test file '{filename}'",
            "session_id": session_id,
            "detail": detail
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}")
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


# --- Chatbot Endpoint ---
@app.post("/api/chat", response_model=ChatResponse)
def chat_endpoint(request: ChatRequest):
    """
    Submits user prompt to multi-LLM router with automatic priority failover
    and strict data provenance enforcement.
    """
    reply, result = chat_with_agent(
        message=request.message,
        conversation_history=request.conversation_history
    )

    return ChatResponse(
        reply=reply,
        active_provider=result.active_provider,
        active_model=result.active_model,
        fallback_occurred=result.fallback_occurred,
        fallback_reason=result.fallback_reason,
        attempted_providers=result.attempted_providers,
        diagnostics=result.diagnostics,
        tool_calls_executed=result.tool_calls_executed
    )


# --- Provider Status Endpoint ---
@app.get("/api/providers")
def get_providers_endpoint():
    """Returns the priority fallback order, configuration state, and models for each LLM provider."""
    cfg = router.config
    providers = router.get_ordered_providers()
    status_list = []

    for p in providers:
        configured = cfg.is_provider_configured(p)
        model_name = cfg.get_model_name(p)
        status_list.append({
            "provider": p.upper(),
            "id": p,
            "configured": configured,
            "model": model_name,
            "is_primary": (p == cfg.primary_llm)
        })

    return {
        "fallback_order": [p.upper() for p in providers],
        "primary_provider": cfg.primary_llm.upper(),
        "providers": status_list,
        "rule_based_fallback_active": True
    }


# --- Simulator Endpoints ---
@app.post("/api/simulator/start")
def start_simulator(req: SimulatorStartRequest):
    """Starts battery test simulation."""
    global active_sim, active_sim_session_id

    active_sim_session_id = create_session(battery_id=1)
    active_sim = BatterySimulator(
        session_id=active_sim_session_id,
        capacity_ah=req.capacity_ah,
        initial_soc=req.initial_soc
    )

    if req.mode.upper() == "DISCHARGE":
        active_sim.start_discharge(req.current_amps)
    else:
        active_sim.start_charge(req.current_amps)

    step_data = active_sim.step()
    return {
        "status": "started",
        "session_id": active_sim_session_id,
        "mode": active_sim.mode,
        "step": step_data
    }


@app.post("/api/simulator/step")
def step_simulator():
    """Steps the simulator forward by one time interval."""
    global active_sim, active_sim_session_id
    if not active_sim or not active_sim.is_running:
        raise HTTPException(status_code=400, detail="Simulator is not running. Start it first.")

    step_data = active_sim.step()
    return {
        "session_id": active_sim_session_id,
        "mode": active_sim.mode,
        "step": step_data
    }


@app.post("/api/simulator/stop")
def stop_simulator():
    """Stops the simulator and marks the session as COMPLETED."""
    global active_sim, active_sim_session_id
    if active_sim:
        active_sim.stop()
    if active_sim_session_id:
        update_session_status(active_sim_session_id, "COMPLETED")
        sid = active_sim_session_id
        active_sim = None
        active_sim_session_id = None
        return {"status": "stopped", "session_id": sid}

    return {"status": "not_running"}


# --- Serve Built React Frontend (SPA) ---
dist_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))
if os.path.isdir(dist_dir):
    from fastapi.staticfiles import StaticFiles

    assets_dir = os.path.join(dist_dir, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    def serve_frontend_spa(full_path: str):
        # Do not intercept API routes
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="API endpoint not found")
        file_path = os.path.join(dist_dir, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(dist_dir, "index.html"))

