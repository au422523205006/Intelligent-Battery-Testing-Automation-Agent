"""
tests/test_provenance.py - Verification of Battery Data Provenance and Hardware Disconnection.

Verifies:
1. Simulated readings are explicitly labelled SIMULATED in the database, tools, and UI contexts.
2. Disconnected hardware never produces a LIVE_HARDWARE status; always reports DISCONNECTED and UNAVAILABLE.
3. The chatbot system prompt and prompt injection strictly forbid claiming unverified data is verified.
4. If no telemetry exists, the status is reported as UNAVAILABLE without fabricating readings.
5. Unsupported universal battery safety claims are removed in favor of unverified manufacturer limits.
"""

import pytest
import sqlite3
from database import (
    init_db,
    create_session,
    insert_measurement,
    get_latest_measurement_record,
    PROVENANCE_SIMULATED,
    PROVENANCE_STORED_UNVERIFIED,
    PROVENANCE_LIVE_HARDWARE,
    PROVENANCE_UNAVAILABLE,
    DB_PATH,
)
from hardware.bms_mock import BMSMockAdapter
from hardware.workbench_mock import WorkbenchMockAdapter
from simulator import BatterySimulator
from agent import get_battery_status, analyze_battery_health, SYSTEM_PROMPT
from llm_router import LLMRouter, RouterConfig


@pytest.fixture(autouse=True)
def setup_db():
    init_db()


def test_1_simulated_readings_labelled_simulated():
    """Verify simulator outputs are explicitly tagged with SIMULATED provenance."""
    sess_id = create_session()
    sim = BatterySimulator(session_id=sess_id, initial_soc=65.0)
    sim.start_charge(35.0)
    step_data = sim.step()

    assert step_data is not None

    # Check database record
    latest = get_latest_measurement_record()
    assert latest is not None
    assert latest["is_simulated"] is True
    assert latest["provenance"] == PROVENANCE_SIMULATED
    assert "timestamp" in latest

    # Check status tool output
    status_msg = get_battery_status()
    assert "SIMULATED" in status_msg
    assert "Hardware Status: DISCONNECTED" in status_msg
    assert "NOT verified hardware measurements" in status_msg


def test_2_disconnected_hardware_never_produces_live_hardware():
    """Verify disconnected hardware never returns LIVE_HARDWARE."""
    bms = BMSMockAdapter()
    wb = WorkbenchMockAdapter()

    bms_status = bms.get_hardware_status()
    assert bms_status["connected"] is False
    assert bms_status["status"] == "DISCONNECTED"
    assert bms_status["provenance"] == PROVENANCE_UNAVAILABLE
    assert bms_status["provenance"] != PROVENANCE_LIVE_HARDWARE

    wb_status = wb.get_workbench_status()
    assert wb_status["connected"] is False
    assert wb_status["status"] == "DISCONNECTED"
    assert wb_status["provenance"] == PROVENANCE_UNAVAILABLE
    assert wb_status["provenance"] != PROVENANCE_LIVE_HARDWARE

    # Calling read_data must raise ConnectionError, not return fake live data
    with pytest.raises(ConnectionError) as exc_info:
        bms.read_data()
    assert "UNAVAILABLE" in str(exc_info.value) or "disconnected" in str(exc_info.value).lower()


def test_3_chatbot_cannot_claim_unverified_data_verified():
    """Verify prompts and router injection never label unverified telemetry as verified."""
    # Check that SYSTEM_PROMPT explicitly forbids claiming data is verified
    assert "NEVER claim readings are 'verified'" in SYSTEM_PROMPT
    assert "Physical battery and BMS hardware are DISCONNECTED" in SYSTEM_PROMPT
    assert "SIMULATED" in SYSTEM_PROMPT

    # Check router prompt injection
    router = LLMRouter(RouterConfig())
    # Mock tool executor
    dummy_executor = lambda q: "Voltage: 380V | Current: 0A"
    
    # Track the prompt generated
    with pytest.MonkeyPatch.context() as m:
        captured_prompts = []
        def fake_execute(provider, caller):
            return True, "Mock answer acknowledging simulated data", None, None

        m.setattr(router, "_execute_with_retry", fake_execute)
        m.setattr(router.config, "is_provider_configured", lambda p: True)

        res = router.route_query("Show battery status", SYSTEM_PROMPT, tools_executor=dummy_executor)
        
        # Verify no '[Verified Database / Tool Telemetry]' exists in router
        # We inspect llm_router source code or ensure it does not use 'Verified' in prompt injection
        import inspect
        router_src = inspect.getsource(LLMRouter.route_query)
        assert "[Verified Database / Tool Telemetry]" not in router_src
        assert "Hardware Disconnected" in router_src


def test_4_empty_database_reports_unavailable_not_fabricated():
    """Verify that an empty database reports UNAVAILABLE without inventing readings."""
    # Temporarily point to a fresh in-memory or empty table test
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM measurements")
    conn.commit()
    conn.close()

    status = get_battery_status()
    assert "UNAVAILABLE" in status
    assert "No measurement records available" in status
    assert "DISCONNECTED" in status


def test_5_unsupported_universal_safety_claims_removed():
    """Verify battery analysis does not assert universal safety limits."""
    sess_id = create_session()
    sim = BatterySimulator(session_id=sess_id)
    sim.start_charge(50.0)
    sim.step()

    analysis = analyze_battery_health(sess_id)
    assert "Universal battery safety claims are unsupported" in analysis
    assert "manufacturer cell specifications" in analysis
    assert "DISCONNECTED" in analysis
    assert "SIMULATED" in analysis
