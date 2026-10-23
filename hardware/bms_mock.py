"""
hardware/bms_mock.py - BMS Mock Adapter with explicit disconnected status.

Safety guarantee:
- Hardware control remains disabled.
- Never reports connected or LIVE_HARDWARE status.
"""

from typing import Dict, Any

class BMSMockAdapter:
    def __init__(self):
        self.connected = False

    def get_hardware_status(self) -> Dict[str, Any]:
        """Returns the hardware status and data provenance."""
        return {
            "connected": False,
            "status": "DISCONNECTED",
            "provenance": "UNAVAILABLE",
            "message": "Physical BMS hardware is disconnected. Real-time telemetry is UNAVAILABLE."
        }

    def connect(self) -> bool:
        print("[HARDWARE MOCK] Hardware-not-connected status. Physical hardware is disconnected.")
        self.connected = False
        return False

    def read_data(self):
        raise ConnectionError("Physical BMS hardware is disconnected. Real-time hardware telemetry is UNAVAILABLE.")

    def send_command(self, cmd):
        raise PermissionError("Physical hardware control is disabled. Hardware is disconnected.")
