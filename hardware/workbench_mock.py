"""
hardware/workbench_mock.py - Battery Workbench Mock Adapter.

Safety guarantee:
- Hardware load control remains disabled.
- Never reports connected or LIVE_HARDWARE status.
"""

from typing import Dict, Any

class WorkbenchMockAdapter:
    def __init__(self):
        self.connected = False

    def get_workbench_status(self) -> Dict[str, Any]:
        """Returns the workbench status and data provenance."""
        return {
            "connected": False,
            "status": "DISCONNECTED",
            "provenance": "UNAVAILABLE",
            "message": "Physical battery testing workbench is detached. Hardware control is disabled."
        }

    def initialize(self):
        print("[HARDWARE MOCK] Initializing workbench mock. Real hardware is detached.")
        self.connected = False

    def set_load(self, current):
        raise PermissionError("Cannot set load. Physical hardware is disconnected.")
