"""
report_generator.py - PDF Report Generation with explicit Data Provenance.
"""

from fpdf import FPDF
import pandas as pd
from datetime import datetime
import os
from database import get_session_measurements, get_session_alerts

class PDF(FPDF):
    def header(self):
        self.set_font('Arial', 'B', 15)
        self.cell(0, 10, 'EV Battery Test Report (SIMULATED)', 0, 1, 'C')
        self.set_font('Arial', 'I', 9)
        self.cell(0, 5, 'Hardware Status: DISCONNECTED | Data Provenance: SIMULATED', 0, 1, 'C')
        self.ln(5)

    def footer(self):
        self.set_y(-15)
        self.set_font('Arial', 'I', 8)
        self.cell(0, 10, f'Page {self.page_no()} - Simulated Test Data (Unverified Hardware)', 0, 0, 'C')

def generate_pdf_report(session_id, battery_info):
    df_meas = get_session_measurements(session_id)
    df_alerts = get_session_alerts(session_id)

    pdf = PDF()
    pdf.add_page()

    pdf.set_font('Arial', 'B', 12)
    pdf.cell(0, 10, 'Battery Information & Provenance', 0, 1)
    pdf.set_font('Arial', '', 10)
    pdf.cell(0, 7, f"Pack Name: {battery_info.get('name', 'N/A')}", 0, 1)
    pdf.cell(0, 7, f"Nominal Voltage: {battery_info.get('nominal_voltage', 'N/A')} V", 0, 1)
    pdf.cell(0, 7, f"Capacity: {battery_info.get('capacity_ah', 'N/A')} Ah", 0, 1)
    pdf.cell(0, 7, f"Chemistry: {battery_info.get('chemistry', 'N/A')}", 0, 1)
    pdf.cell(0, 7, f"Hardware Status: DISCONNECTED (Mock Adapters Active)", 0, 1)
    pdf.cell(0, 7, f"Telemetry Provenance: SIMULATED (Software Model Profile)", 0, 1)

    pdf.ln(5)

    pdf.set_font('Arial', 'B', 12)
    pdf.cell(0, 10, f'Session Summary (ID: #{session_id})', 0, 1)
    pdf.set_font('Arial', '', 10)
    if not df_meas.empty:
        max_v = df_meas['voltage'].max()
        min_v = df_meas['voltage'].min()
        max_t = df_meas['temperature'].max()
        avg_c = df_meas['current'].mean()

        pdf.cell(0, 7, f"Peak Voltage: {max_v:.2f} V", 0, 1)
        pdf.cell(0, 7, f"Minimum Voltage: {min_v:.2f} V", 0, 1)
        pdf.cell(0, 7, f"Maximum Temperature: {max_t:.2f} C", 0, 1)
        pdf.cell(0, 7, f"Average Current: {avg_c:.2f} A", 0, 1)
        pdf.cell(0, 7, f"Recorded Data Points: {len(df_meas)}", 0, 1)

        nominal_energy = battery_info.get('nominal_voltage', 400) * battery_info.get('capacity_ah', 100)
        pdf.cell(0, 7, f"Calculated Nominal Energy: {nominal_energy} Wh", 0, 1)
    else:
        pdf.cell(0, 7, "No measurement data found for this session.", 0, 1)

    pdf.ln(5)

    pdf.set_font('Arial', 'B', 12)
    pdf.cell(0, 10, 'Alerts & Test Boundary Excursions', 0, 1)
    pdf.set_font('Arial', '', 10)
    if not df_alerts.empty:
        for idx, row in df_alerts.iterrows():
            pdf.cell(0, 7, f"[{row['timestamp']}] {row['severity']}: {row['message']}", 0, 1)
    else:
        pdf.cell(0, 7, "No threshold excursions triggered during this session.", 0, 1)

    pdf.ln(5)
    pdf.set_font('Arial', 'I', 8)
    pdf.multi_cell(0, 5, "Disclaimer: These measurements originate entirely from software simulation. Physical hardware is not connected. This report does not constitute a certified hardware validation or State of Health (SOH) laboratory verification.")

    filename = f"report_session_{session_id}.pdf"
    pdf.output(filename)
    return os.path.abspath(filename)
