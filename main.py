import streamlit as st
import pandas as pd
import plotly.express as px
from database import (
    init_db,
    get_all_sessions,
    create_session,
    update_session_status,
    get_session_measurements,
    get_session_alerts,
    get_latest_measurements
)
from simulator import BatterySimulator
from agent import get_agent, chat_with_agent
from llm_router import RouterResult
import time
import os

st.set_page_config(page_title="EV Battery Monitoring & Agent", layout="wide", page_icon="🔋")

# Initialize SQLite database
if "db_initialized" not in st.session_state:
    init_db()
    st.session_state.db_initialized = True

if "simulator" not in st.session_state:
    st.session_state.simulator = None

if "agent_setup" not in st.session_state:
    router_instance, is_llm_ready = get_agent()
    st.session_state.agent_executor = router_instance
    st.session_state.is_llm_ready = is_llm_ready
    st.session_state.agent_setup = True

if "chat_history" not in st.session_state:
    st.session_state.chat_history = []

router = st.session_state.agent_executor

# Sidebar Navigation
st.sidebar.title("🔋 EV Battery Manager")
menu = st.sidebar.radio("Navigation", ["Overview", "Live Simulator", "Chatbot", "Historical Data"])

# Provider status sidebar section
st.sidebar.markdown("---")
st.sidebar.subheader("🤖 LLM Provider Health")
providers_order = router.get_ordered_providers()
for prov in providers_order:
    is_conf = router.config.is_provider_configured(prov)
    mod_name = router.config.get_model_name(prov)
    
    # Check if we have recent diagnostic info
    diag = router.last_diagnostics.get(prov, {})
    diag_status = diag.get("status", "Configured" if is_conf else "Not configured")
    diag_reason = diag.get("reason", "")
    
    if not is_conf:
        icon = "⚪"
        badge = "Not Configured"
    elif diag_status == "Successful response":
        icon = "🟢"
        badge = "Active (Success)"
    elif diag_status in ["Rate limited or quota exhausted", "Server error", "Timeout/network error"]:
        icon = "🟡"
        badge = diag_status
    elif diag_status in ["Model unavailable", "Authentication/configuration error"]:
        icon = "🔴"
        badge = diag_status
    else:
        icon = "🟢" if is_conf else "⚪"
        badge = "Ready"

    with st.sidebar.expander(f"{icon} **{prov.upper()}**", expanded=False):
        st.write(f"**Status:** `{badge}`")
        st.write(f"**Model:** `{mod_name}`")
        if diag_reason and diag_reason != "Successful response":
            st.caption(f"ℹ️ {diag_reason}")

st.sidebar.markdown(f"**Failover Priority:**\n`{' ➡️ '.join([p.upper() for p in providers_order])}`")
st.sidebar.caption("Automatic failover: Rate limits, 404 models, 500 errors, timeouts.")

st.sidebar.markdown("---")
st.sidebar.subheader("🔌 Hardware & Data Source")
st.sidebar.markdown("• **BMS Hardware:** `🔴 DISCONNECTED`")
st.sidebar.markdown("• **Data Provenance:** `SIMULATED`")
st.sidebar.caption("Real hardware is detached. All readings are simulated; live hardware telemetry is unavailable.")

# -----------------------------------------------------------------------------
# Overview Page
# -----------------------------------------------------------------------------
if menu == "Overview":
    st.title("🔋 EV Battery Monitoring Overview")
    st.info(
        "Welcome to the **AI-Powered EV Battery Monitoring and Intelligent Control Agent**.\n\n"
        "This platform monitors simulated EV battery pack telemetry, flags safety limit violations, "
        "generates engineering PDF reports, and provides an intelligent multi-LLM chatbot with automated fallback.\n\n"
        "⚠️ **Hardware Status**: Physical battery hardware is **DISCONNECTED**. Telemetry provenance is **SIMULATED**; "
        "live hardware monitoring is unavailable."
    )

    col1, col2, col3, col4 = st.columns(4)
    with col1:
        st.metric("BMS Hardware Status", "DISCONNECTED", delta_color="off")
        st.caption("Safety Lock: Real hardware control strictly disabled.")
    with col2:
        st.metric("Data Provenance", "SIMULATED", delta_color="off")
        st.caption("Source: Local Software Simulator")
    with col3:
        active_llm = router.last_active_provider if router.last_active_provider != "uninitialized" else router.config.primary_llm
        st.metric("Primary / Active LLM", active_llm.title())
        st.caption(f"Model: {router.config.get_model_name(active_llm)}")
    with col4:
        fb_status = "Active" if router.last_fallback_occurred else "Nominal"
        st.metric("LLM Failover State", fb_status)
        st.caption("Automatic bounded fallback enabled")

    st.subheader("System Safety Interlocks & Provenance Guarantee")
    st.markdown(
        """
        - **Hardware Disconnected**: Physical CAN/Bluetooth and Workbench adapters are detached mock interfaces.
        - **Data Provenance (`SIMULATED`)**: Telemetry originates from mathematical software simulation curves; never presented as verified hardware measurements.
        - **Non-Fabrication Policy**: The AI agent will never invent battery metrics or fake State of Health (SOH) values.
        - **Multi-LLM Resilience**: Groq (Primary) ➡️ OpenRouter (Secondary) ➡️ Gemini (Third) ➡️ Ollama (Offline) ➡️ Local Rule-based Fallback.
        """
    )

# -----------------------------------------------------------------------------
# Live Simulator Page
# -----------------------------------------------------------------------------
elif menu == "Live Simulator":
    st.title("⚡ Battery Test Simulator")
    st.warning("⚠️ All readings are SIMULATED. Real physical hardware commands remain disabled.")

    col_btn1, col_btn2 = st.columns([1, 4])
    with col_btn1:
        if st.button("➕ Start New Session", use_container_width=True):
            sess_id = create_session()
            st.session_state.simulator = BatterySimulator(session_id=sess_id)
            st.success(f"Started Session #{sess_id}")

    if st.session_state.simulator:
        sim = st.session_state.simulator
        st.caption(f"Active Session ID: **#{sim.session_id}** | State: **{sim.mode}**")

        c1, c2, c3 = st.columns(3)
        with c1:
            if st.button("▶️ Start 50A Charge", use_container_width=True):
                sim.start_charge(50.0)
                update_session_status(sim.session_id, "CHARGING")
        with c2:
            if st.button("⚡ Start 50A Discharge", use_container_width=True):
                sim.start_discharge(50.0)
                update_session_status(sim.session_id, "DISCHARGING")
        with c3:
            if st.button("⏹️ Pause / Stop", use_container_width=True):
                sim.stop()
                update_session_status(sim.session_id, "PAUSED")

        if sim.is_running:
            sim.step()
            time.sleep(0.4)
            st.rerun()

        st.subheader("Pack Telemetry (Provenance: SIMULATED | Hardware: DISCONNECTED)")
        st.caption("ℹ️ Physical BMS is disconnected. Readings below are generated by the software simulation model.")
        metrics_col1, metrics_col2, metrics_col3, metrics_col4 = st.columns(4)
        metrics_col1.metric("Pack Voltage", f"{sim.voltage:.2f} V")
        metrics_col2.metric("Current", f"{sim.current:.2f} A")
        metrics_col3.metric("Cell Temperature", f"{sim.temperature:.2f} °C")
        metrics_col4.metric("Estimated SOC", f"{sim.soc:.2f} %")

        df_live = get_latest_measurements(sim.session_id, limit=50)
        if not df_live.empty:
            chart_col1, chart_col2 = st.columns(2)
            with chart_col1:
                st.plotly_chart(
                    px.line(df_live, x='timestamp', y='voltage', title='Pack Voltage Trend (V) [Simulated]'),
                    use_container_width=True
                )
            with chart_col2:
                st.plotly_chart(
                    px.line(df_live, x='timestamp', y='current', title='Current Trend (A) [Simulated]'),
                    use_container_width=True
                )
    else:
        st.info("Click 'Start New Session' to begin simulating battery charge and discharge profiles.")

# -----------------------------------------------------------------------------
# AI Chatbot Page
# -----------------------------------------------------------------------------
elif menu == "Chatbot":
    st.title("🤖 AI Battery Monitoring Assistant")

    # Status header showing current LLM and fallback information
    active_prov = router.last_active_provider if router.last_active_provider != "uninitialized" else router.config.primary_llm
    active_mod = router.last_active_model if router.last_active_model != "uninitialized" else router.config.get_model_name(active_prov)

    header_cols = st.columns([2, 2, 2])
    with header_cols[0]:
        st.markdown(f"**Active Provider:** `{active_prov.upper()}`")
    with header_cols[1]:
        st.markdown(f"**Model:** `{active_mod}`")
    with header_cols[2]:
        if router.last_fallback_occurred:
            st.markdown("⚡ **Fallback:** `Triggered`")
        else:
            st.markdown("🟢 **Fallback:** `Idle (Primary Active)`")

    if router.last_fallback_occurred and router.last_fallback_reason:
        st.warning(f"ℹ️ **Automatic Fallback Event:** {router.last_fallback_reason}")

    st.markdown("---")

    # Render Chat History
    for msg in st.session_state.chat_history:
        role = msg["role"]
        with st.chat_message(role):
            st.markdown(msg["content"])
            if role == "assistant" and "provider" in msg:
                prov_label = msg.get("provider", "AI").upper()
                mod_label = msg.get("model", "")
                badge_text = f"🤖 Answered by **{prov_label}**"
                if mod_label:
                    badge_text += f" (`{mod_label}`)"
                if msg.get("fallback_note"):
                    badge_text += f" • ⚡ *{msg['fallback_note']}*"
                st.caption(badge_text)

    # Input Box
    user_input = st.chat_input("Ask about battery status, health analysis, or reports...")
    if user_input:
        # Add user query
        st.session_state.chat_history.append({"role": "user", "content": user_input})
        with st.chat_message("user"):
            st.markdown(user_input)

        with st.chat_message("assistant"):
            with st.spinner("Analyzing telemetry & querying LLM router..."):
                reply, result = chat_with_agent(
                    user_input,
                    router,
                    conversation_history=st.session_state.chat_history
                )
                st.markdown(reply)

                # Show provider badge and fallback status
                prov_badge = f"🤖 Answered by **{result.active_provider.upper()}** (`{result.active_model}`)"
                fallback_note = None
                if result.fallback_occurred:
                    fallback_note = f"Failover triggered: {result.fallback_reason or 'Previous provider unavailable'}"
                    prov_badge += f" • ⚡ *{fallback_note}*"
                st.caption(prov_badge)

        st.session_state.chat_history.append({
            "role": "assistant",
            "content": reply,
            "provider": result.active_provider.upper(),
            "model": result.active_model,
            "fallback_note": fallback_note
        })

# -----------------------------------------------------------------------------
# Historical Data Page
# -----------------------------------------------------------------------------
elif menu == "Historical Data":
    st.title("📊 Historical Test Records & PDF Reports")

    sessions_df = get_all_sessions()
    if sessions_df.empty:
        st.info("No test sessions recorded yet. Start a session in the Live Simulator first.")
    else:
        st.dataframe(sessions_df, use_container_width=True)

        selected_session = st.selectbox(
            "Select Session to Inspect / Generate Report",
            sessions_df['id'].tolist()
        )

        col_rep1, col_rep2 = st.columns([1, 3])
        with col_rep1:
            if st.button("📄 Generate PDF Report", use_container_width=True):
                from report_generator import generate_pdf_report
                battery_info = {
                    'name': 'Default EV Pack',
                    'nominal_voltage': 400.0,
                    'capacity_ah': 100.0,
                    'chemistry': 'Li-Ion'
                }
                pdf_path = generate_pdf_report(selected_session, battery_info)
                st.success(f"Generated PDF: {pdf_path}")
                if os.path.exists(pdf_path):
                    with open(pdf_path, "rb") as f:
                        st.download_button(
                            label="⬇️ Download PDF Report",
                            data=f,
                            file_name=f"report_session_{selected_session}.pdf",
                            mime="application/pdf"
                        )

        meas_df = get_session_measurements(selected_session)
        if not meas_df.empty:
            st.subheader(f"Session #{selected_session} Telemetry Charts")
            st.plotly_chart(
                px.line(meas_df, x='timestamp', y=['voltage', 'temperature'],
                        title=f'Voltage (V) & Temperature (°C) — Session #{selected_session}'),
                use_container_width=True
            )
            st.plotly_chart(
                px.line(meas_df, x='timestamp', y='soc',
                        title=f'State of Charge (SOC %) — Session #{selected_session}'),
                use_container_width=True
            )

        alerts_df = get_session_alerts(selected_session)
        if not alerts_df.empty:
            st.subheader(f"Alerts & Violations Recorded (#{selected_session})")
            st.dataframe(alerts_df, use_container_width=True)
        else:
            st.success("No anomalies or safety limit violations recorded for this session.")
