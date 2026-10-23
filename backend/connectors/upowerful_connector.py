"""
backend/connectors/upowerful_connector.py - uPowerful BST Data Integration Connector.

Integrates real battery test records from uPowerful BST and BettaTeQ software.
Features:
- Automated discovery and parsing of binary .main test record files using 32-bit .NET interop bridge.
- Fallback parsing for laboratory CSV exports.
- Ingestion into SQLite database with provenance IMPORTED_REPORT.
- Safe diagnostic reporting without exposing secrets.
"""

import os
import json
import glob
import subprocess
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional
import pandas as pd
from database import (
    save_upowerful_test,
    PROVENANCE_IMPORTED_REPORT,
    get_test_sessions_list,
    init_db
)

logger = logging.getLogger("uPowerfulConnector")

# Default paths
DEFAULT_INSTALL_DIR = os.getenv(
    "UPOWERFUL_INSTALL_DIR",
    r"C:\Users\Admin\Downloads\UPowerful BST(2022.05.21)\UPowerful BST(2022.05.21)"
)
DEFAULT_DATA_DIR = os.getenv(
    "UPOWERFUL_DATA_DIR",
    os.path.join(DEFAULT_INSTALL_DIR, "SampleData")
)

# 32-bit PowerShell path for x86 .NET assemblies
SYSWOW64_POWERSHELL = r"C:\Windows\SysWOW64\WindowsPowerShell\v1.0\powershell.exe"
BRIDGE_SCRIPT = os.path.abspath(os.path.join(os.path.dirname(__file__), "upowerful_bridge.ps1"))

_last_sync_time: Optional[str] = None


class UPowerfulConnector:
    def __init__(self, install_dir: Optional[str] = None, data_dir: Optional[str] = None):
        self.install_dir = install_dir or DEFAULT_INSTALL_DIR
        self.data_dir = data_dir or DEFAULT_DATA_DIR
        self.powershell_path = SYSWOW64_POWERSHELL if os.path.exists(SYSWOW64_POWERSHELL) else "powershell.exe"
        self.bridge_path = BRIDGE_SCRIPT
        init_db()

    def get_status(self) -> Dict[str, Any]:
        """Returns connector health, directory existence, and detected test files."""
        install_exists = os.path.isdir(self.install_dir)
        core_dll = os.path.join(self.install_dir, "DataView.Core.dll")
        analyser_dll = os.path.join(self.install_dir, "DataView.DataAnalyser.dll")
        dlls_exist = os.path.isfile(core_dll) and os.path.isfile(analyser_dll)

        data_exists = os.path.isdir(self.data_dir)
        detected_files = self.find_test_files() if data_exists else []

        # Count synced sessions in DB
        synced_sessions = get_test_sessions_list(limit=500)
        synced_count = sum(1 for s in synced_sessions if s.get("provenance") == PROVENANCE_IMPORTED_REPORT)

        return {
            "installed": install_exists and dlls_exist,
            "install_dir": self.install_dir,
            "data_dir": self.data_dir,
            "data_dir_exists": data_exists,
            "dlls_present": dlls_exist,
            "bridge_script": self.bridge_path,
            "bridge_available": os.path.isfile(self.bridge_path),
            "detected_files_count": len(detected_files),
            "synced_tests_count": synced_count,
            "last_sync_time": _last_sync_time,
            "sample_files": [os.path.basename(f) for f in detected_files[:10]]
        }

    def find_test_files(self) -> List[str]:
        """Finds all .main files in the configured data directory recursively."""
        if not os.path.isdir(self.data_dir):
            return []
        pattern = os.path.join(self.data_dir, "**", "*.main")
        files = glob.glob(pattern, recursive=True)
        return sorted(files)

    def parse_main_file(self, file_path: str) -> Dict[str, Any]:
        """Parses a binary .main file via upowerful_bridge.ps1."""
        if not os.path.isfile(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        cmd = [
            self.powershell_path,
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy", "Bypass",
            "-File", self.bridge_path,
            "-FilePath", os.path.abspath(file_path),
            "-DllDir", os.path.abspath(self.install_dir)
        ]

        logger.info(f"Executing uPowerful bridge for: {file_path}")
        proc = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=30
        )

        if proc.returncode != 0:
            err = proc.stderr.strip() or f"Process failed with exit code {proc.returncode}"
            logger.error(f"Bridge execution error: {err}")
            raise RuntimeError(f"uPowerful bridge failed: {err}")

        out = proc.stdout.strip()
        if not out:
            raise ValueError("Empty output returned from uPowerful bridge parser")

        data = json.loads(out)
        return data

    def parse_csv_file(self, file_path: str) -> Dict[str, Any]:
        """Fallback parser for lab CSV exports."""
        df = pd.read_csv(file_path)
        col_map = {col.lower(): col for col in df.columns}

        v_col = next((col_map[c] for c in col_map if "volt" in c), None)
        c_col = next((col_map[c] for c in col_map if "curr" in c or "amp" in c), None)
        t_col = next((col_map[c] for c in col_map if "temp" in c), None)
        cap_col = next((col_map[c] for c in col_map if "cap" in c), None)
        eng_col = next((col_map[c] for c in col_map if "ener" in c), None)
        step_col = next((col_map[c] for c in col_map if "step" in c), None)

        records = []
        for idx, row in df.iterrows():
            records.append({
                "serial_num": idx + 1,
                "timestamp": str(row.get("Time", datetime.now().isoformat())),
                "relative_time_sec": float(idx),
                "voltage": float(row[v_col]) if v_col else 0.0,
                "current": float(row[c_col]) if c_col else 0.0,
                "capacity": float(row[cap_col]) if cap_col else 0.0,
                "energy": float(row[eng_col]) if eng_col else 0.0,
                "temperature": float(row[t_col]) if t_col else 25.0,
                "process_type": "LAB_CSV_EXPORT",
                "step_no": int(row[step_col]) if step_col and pd.notna(row[step_col]) else 1,
                "cycle_no": 1
            })

        max_v = max(r["voltage"] for r in records) if records else 0.0
        min_v = min(r["voltage"] for r in records) if records else 0.0
        max_c = max(r["current"] for r in records) if records else 0.0
        min_c = min(r["current"] for r in records) if records else 0.0
        max_t = max(r["temperature"] for r in records) if records else 25.0
        min_t = min(r["temperature"] for r in records) if records else 25.0
        cap_ah = max(r["capacity"] for r in records) if records else 0.0
        eng_wh = max(r["energy"] for r in records) if records else 0.0

        return {
            "header": {
                "procedure_name": os.path.splitext(os.path.basename(file_path))[0],
                "product_batch": "CSV_IMPORT",
                "source_file": file_path,
                "record_count": len(records),
                "channel_no": 1,
                "start_time": datetime.now().isoformat(),
                "end_time": datetime.now().isoformat()
            },
            "summary": {
                "max_voltage": round(max_v, 4),
                "min_voltage": round(min_v, 4),
                "max_current": round(max_c, 4),
                "min_current": round(min_c, 4),
                "capacity_ah": round(cap_ah, 5),
                "energy_wh": round(eng_wh, 5),
                "peak_temperature": round(max_t, 2),
                "min_temperature": round(min_t, 2),
                "avg_temperature": round((max_t + min_t) / 2, 2),
                "duration_seconds": len(records),
                "total_records": len(records)
            },
            "records": records
        }

    def import_single_file(self, file_path: str) -> int:
        """Parses and stores a single .main or .csv file into the database."""
        ext = os.path.splitext(file_path)[1].lower()
        if ext == ".main":
            parsed = self.parse_main_file(file_path)
        elif ext in [".csv", ".tsv", ".txt"]:
            parsed = self.parse_csv_file(file_path)
        else:
            raise ValueError(f"Unsupported file format: {ext}. Expected .main or .csv")

        session_id = save_upowerful_test(parsed)
        return session_id

    def scan_and_sync(self, max_files: int = 25) -> Dict[str, Any]:
        """
        Scans data directory for .main files and ingests files not yet imported.
        """
        global _last_sync_time
        _last_sync_time = datetime.now().isoformat()

        files = self.find_test_files()
        logger.info(f"Discovered {len(files)} .main files in {self.data_dir}")

        synced_sessions = get_test_sessions_list(limit=500)
        already_synced_files = {
            s.get("source_file") for s in synced_sessions if s.get("source_file")
        }

        imported_count = 0
        skipped_count = 0
        errors = []

        for f in files:
            if f in already_synced_files:
                skipped_count += 1
                continue

            if imported_count >= max_files:
                break

            try:
                sid = self.import_single_file(f)
                already_synced_files.add(f)
                imported_count += 1
                logger.info(f"Successfully imported {f} -> Session ID {sid}")
            except Exception as e:
                err_msg = f"{os.path.basename(f)}: {str(e)}"
                logger.error(f"Failed to import {f}: {err_msg}")
                errors.append(err_msg)

        return {
            "status": "success",
            "total_detected": len(files),
            "newly_imported": imported_count,
            "already_synced": skipped_count,
            "last_sync_time": _last_sync_time,
            "errors": errors
        }
