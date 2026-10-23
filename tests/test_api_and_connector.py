"""
tests/test_api_and_connector.py - Tests for uPowerful BST Connector, FastAPI Backend, and Multi-LLM Chatbot.
"""

import os
import pytest
from fastapi.testclient import TestClient
from backend.api import app
from backend.connectors.upowerful_connector import UPowerfulConnector
from database import (
    init_db,
    PROVENANCE_IMPORTED_REPORT,
    PROVENANCE_SIMULATED,
    get_test_sessions_list,
    get_test_session_detail,
)

@pytest.fixture(scope="module")
def client():
    init_db()
    with TestClient(app) as test_client:
        yield test_client


def test_health_endpoint(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"
    assert data["hardware_status"] == "DISCONNECTED"
    assert data["hardware_control"] == "LOCKED"


def test_battery_status_endpoint(client):
    res = client.get("/api/battery/status")
    assert res.status_code == 200
    data = res.json()
    assert data["hardware_status"] == "DISCONNECTED"
    assert "not connected" in data["hardware_message"].lower() or "disconnected" in data["hardware_message"].lower()
    assert "telemetry" in data
    assert "provenance" in data["telemetry"]
    assert data["telemetry"]["provenance"] != "LIVE_HARDWARE"


def test_pack_summary_endpoint(client):
    res = client.get("/api/pack/summary")
    assert res.status_code == 200
    data = res.json()
    assert "pack" in data
    assert data["hardware_status"] == "DISCONNECTED"
    assert data["pack"]["nominal_voltage"] > 0


def test_upowerful_connector_status():
    connector = UPowerfulConnector()
    status = connector.get_status()
    assert status["installed"] is True
    assert status["bridge_available"] is True
    assert status["detected_files_count"] > 0
    assert len(status["sample_files"]) > 0


def test_upowerful_connector_sync():
    connector = UPowerfulConnector()
    sync_result = connector.scan_and_sync(max_files=2)
    assert sync_result["status"] == "success"
    assert "total_detected" in sync_result
    assert sync_result["total_detected"] > 0


def test_list_tests_endpoint(client):
    res = client.get("/api/tests")
    assert res.status_code == 200
    data = res.json()
    assert "tests" in data
    assert data["total"] >= 1
    assert any(t["provenance"] == PROVENANCE_IMPORTED_REPORT for t in data["tests"])


def test_test_detail_and_measurements(client):
    tests_res = client.get("/api/tests")
    tests = tests_res.json()["tests"]
    assert len(tests) > 0
    test_id = tests[0]["id"]

    detail_res = client.get(f"/api/tests/{test_id}")
    assert detail_res.status_code == 200
    detail = detail_res.json()
    assert detail["id"] == test_id
    assert "test_name" in detail
    assert "provenance" in detail

    meas_res = client.get(f"/api/tests/{test_id}/measurements")
    assert meas_res.status_code == 200
    meas = meas_res.json()
    assert "records" in meas
    assert isinstance(meas["records"], list)


def test_pdf_report_generation(client):
    tests_res = client.get("/api/tests")
    tests = tests_res.json()["tests"]
    assert len(tests) > 0
    test_id = tests[0]["id"]

    report_res = client.get(f"/api/tests/{test_id}/report")
    assert report_res.status_code == 200
    assert report_res.headers["content-type"] == "application/pdf"
    assert len(report_res.content) > 500


def test_simulator_lifecycle(client):
    # Start simulator
    start_res = client.post("/api/simulator/start", json={
        "mode": "CHARGE",
        "current_amps": 40.0,
        "initial_soc": 50.0,
        "capacity_ah": 100.0
    })
    assert start_res.status_code == 200
    start_data = start_res.json()
    assert start_data["status"] == "started"
    assert start_data["mode"] == "CHARGE"
    assert "step" in start_data

    # Step simulator
    step_res = client.post("/api/simulator/step")
    assert step_res.status_code == 200
    step_data = step_res.json()
    assert "step" in step_data
    assert step_data["step"]["voltage"] > 0

    # Stop simulator
    stop_res = client.post("/api/simulator/stop")
    assert stop_res.status_code == 200
    assert stop_res.json()["status"] == "stopped"


def test_chat_battery_status_provenance(client):
    res = client.post("/api/chat", json={"message": "Show battery status"})
    assert res.status_code == 200
    data = res.json()
    assert "reply" in data
    assert "active_provider" in data
    # Ensure no false live hardware claims
    reply = data["reply"].lower()
    assert "live hardware" not in reply or "not" in reply or "disconnected" in reply or "unavailable" in reply


def test_chat_upowerful_inquiry(client):
    res = client.post("/api/chat", json={"message": "Show uPowerful BST lab tests and status"})
    assert res.status_code == 200
    data = res.json()
    assert "reply" in data
    assert any(term in data["reply"].lower() for term in ["upowerful", "bettateq", "lab", "test", "main", "session"])
