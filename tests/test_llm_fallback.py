"""
tests/test_llm_fallback.py - Comprehensive Automated Tests for Multi-LLM Failover

Covers:
1. Groq success.
2. Groq failure -> OpenRouter success.
3. Groq and OpenRouter failure -> Gemini success.
4. First three providers fail -> Ollama success.
5. Any provider order with failures followed by a successful provider.
6. All providers fail -> rule-based fallback.
7. Missing API keys or invalid configuration handled safely.
8. Ollama model unavailable handled with exact diagnostic.
9. No API keys or secrets leaked in logs or error messages.
10. Battery simulation and analysis remain fully functional.

All tests use mocked provider responses to avoid consuming real API quota.
"""

import pytest
import httpx
import re
from unittest.mock import MagicMock, patch

from llm_router import (
    LLMRouter,
    RouterConfig,
    RouterResult,
    ProviderDiagnostic,
    classify_error,
    sanitize_message
)
from agent import chat_with_agent, analyze_battery_health, get_battery_status
from simulator import BatterySimulator
from database import init_db, create_session, get_session_measurements


@pytest.fixture(autouse=True)
def setup_test_db():
    """Ensure database is initialized for tests."""
    init_db()


def make_mock_config(
    groq_key="gsk_mock_valid_groq_key_1234567890",
    openrouter_key="sk-or-v1_mock_valid_openrouter_key_1234567890",
    gemini_key="AIza_mock_valid_gemini_key_1234567890",
    primary="groq",
    fallback_order="groq,openrouter,gemini,ollama",
    timeout=5.0,
    max_retries=2
):
    cfg = RouterConfig()
    cfg.groq_api_key = groq_key
    cfg.groq_model = "openai/gpt-oss-20b"
    cfg.openrouter_api_key = openrouter_key
    cfg.openrouter_model = "meta-llama/llama-3.3-70b-instruct"
    cfg.gemini_api_key = gemini_key
    cfg.gemini_model = "gemini-flash-latest"
    cfg.ollama_base_url = "http://localhost:11434"
    cfg.ollama_model = "tinyllama:latest"
    cfg.primary_llm = primary
    cfg.fallback_order = [p.strip() for p in fallback_order.split(",") if p.strip()]
    cfg.timeout_seconds = timeout
    cfg.max_retries = max_retries
    return cfg


# -----------------------------------------------------------------------------
# 1. Groq success
# -----------------------------------------------------------------------------
def test_1_groq_success():
    cfg = make_mock_config()
    router = LLMRouter(cfg)

    with patch.object(router, "_call_groq", return_value="GROQ: Pack telemetry is within limits.") as mock_groq:
        result = router.route_query("Check pack voltage", "System prompt")

        assert result.active_provider == "GROQ"
        assert result.fallback_occurred is False
        assert "Pack telemetry is within limits" in result.content
        assert mock_groq.call_count == 1


# -----------------------------------------------------------------------------
# 2. Groq failure -> OpenRouter success
# -----------------------------------------------------------------------------
def test_2_groq_failure_openrouter_success():
    cfg = make_mock_config()
    router = LLMRouter(cfg)

    req = httpx.Request("POST", "https://api.groq.com")
    resp_429 = httpx.Response(429, request=req, text='{"error": {"message": "Rate limit exceeded"}}')
    rate_err = httpx.HTTPStatusError("429 Rate limit", request=req, response=resp_429)

    with patch.object(router, "_call_groq", side_effect=rate_err), \
         patch.object(router, "_call_openrouter", return_value="OPENROUTER: Handled failover after Groq 429.") as mock_or:

        result = router.route_query("Check battery status", "System prompt")

        assert result.active_provider == "OPENROUTER"
        assert result.fallback_occurred is True
        assert "Handled failover" in result.content
        assert mock_or.call_count == 1
        assert "groq" in result.diagnostics
        assert result.diagnostics["groq"]["status"] == ProviderDiagnostic.RATE_LIMITED_OR_QUOTA.value


# -----------------------------------------------------------------------------
# 3. Groq and OpenRouter failure -> Gemini success
# -----------------------------------------------------------------------------
def test_3_groq_and_openrouter_failure_gemini_success():
    cfg = make_mock_config()
    router = LLMRouter(cfg)

    req = httpx.Request("POST", "http://test")
    err_500 = httpx.HTTPStatusError("500 Server error", request=req, response=httpx.Response(500, request=req))
    err_timeout = httpx.TimeoutException("Read timed out")

    with patch.object(router, "_call_groq", side_effect=err_500), \
         patch.object(router, "_call_openrouter", side_effect=err_timeout), \
         patch.object(router, "_call_gemini", return_value="GEMINI: Battery health verified nominal.") as mock_gem:

        result = router.route_query("Analyze battery health", "System prompt")

        assert result.active_provider == "GEMINI"
        assert result.fallback_occurred is True
        assert mock_gem.call_count == 1
        assert result.diagnostics["groq"]["status"] == ProviderDiagnostic.SERVER_ERROR.value
        assert result.diagnostics["openrouter"]["status"] == ProviderDiagnostic.TIMEOUT_OR_NETWORK.value


# -----------------------------------------------------------------------------
# 4. First three providers fail -> Ollama success
# -----------------------------------------------------------------------------
def test_4_first_three_providers_fail_ollama_success():
    cfg = make_mock_config()
    router = LLMRouter(cfg)

    req = httpx.Request("POST", "http://test")
    err_429 = httpx.HTTPStatusError("429 Rate limit", request=req, response=httpx.Response(429, request=req))
    err_quota = httpx.HTTPStatusError("402 Quota", request=req, response=httpx.Response(402, request=req, text="insufficient_quota"))
    err_503 = httpx.HTTPStatusError("503 High Demand", request=req, response=httpx.Response(503, request=req))

    with patch.object(router, "_call_groq", side_effect=err_429), \
         patch.object(router, "_call_openrouter", side_effect=err_quota), \
         patch.object(router, "_call_gemini", side_effect=err_503), \
         patch.object(router, "_validate_and_call_ollama", return_value="OLLAMA: Telemetry processed offline.") as mock_ol:

        result = router.route_query("Show voltage trend", "System prompt")

        assert result.active_provider == "OLLAMA"
        assert result.fallback_occurred is True
        assert "OLLAMA" in result.content
        assert mock_ol.call_count == 1


# -----------------------------------------------------------------------------
# 5. Any provider order with failures followed by a successful provider
# -----------------------------------------------------------------------------
def test_5_any_provider_order_with_failures_followed_by_success():
    # Custom priority order: gemini -> groq -> openrouter -> ollama
    cfg = make_mock_config(primary="gemini", fallback_order="gemini,groq,openrouter,ollama")
    router = LLMRouter(cfg)

    req = httpx.Request("POST", "http://test")
    err_429 = httpx.HTTPStatusError("429 Rate limit", request=req, response=httpx.Response(429, request=req))

    with patch.object(router, "_call_gemini", side_effect=err_429), \
         patch.object(router, "_call_groq", return_value="GROQ: Handled after Gemini was rate limited."):

        result = router.route_query("Query status", "System prompt")

        assert result.active_provider == "GROQ"
        assert result.fallback_occurred is True
        assert result.attempted_providers[0] == "gemini"
        assert result.attempted_providers[1] == "groq"


# -----------------------------------------------------------------------------
# 6. All providers fail -> rule-based fallback
# -----------------------------------------------------------------------------
def test_6_all_providers_fail_rule_based_fallback():
    cfg = make_mock_config()
    router = LLMRouter(cfg)

    req = httpx.Request("POST", "http://test")
    err_500 = httpx.HTTPStatusError("500 Server error", request=req, response=httpx.Response(500, request=req))

    with patch.object(router, "_call_groq", side_effect=err_500), \
         patch.object(router, "_call_openrouter", side_effect=err_500), \
         patch.object(router, "_call_gemini", side_effect=err_500), \
         patch.object(router, "_validate_and_call_ollama", side_effect=ConnectionError("Offline")):

        result = router.route_query("Show battery status", "System prompt")

        assert result.active_provider == "RULE_BASED_FALLBACK"
        assert result.fallback_occurred is True
        assert "All online LLM providers are currently unavailable" in result.content


# -----------------------------------------------------------------------------
# 7. Missing API keys or invalid configuration
# -----------------------------------------------------------------------------
def test_7_missing_api_keys_or_invalid_configuration():
    # Groq has placeholder key, OpenRouter valid
    cfg = make_mock_config(groq_key="your_groq_api_key_here")
    router = LLMRouter(cfg)

    with patch.object(router, "_call_groq") as mock_groq, \
         patch.object(router, "_call_openrouter", return_value="OPENROUTER: Responded as Groq was unconfigured."):

        result = router.route_query("Telemetry reading", "System prompt")

        assert result.active_provider == "OPENROUTER"
        assert mock_groq.call_count == 0  # Unconfigured provider was skipped
        assert result.diagnostics["groq"]["status"] == ProviderDiagnostic.NOT_CONFIGURED.value

    # Test Invalid Key (401) stops bounded retries
    secret = "gsk_test_invalid_secret_key_12345"
    cfg2 = make_mock_config(groq_key=secret, max_retries=3)
    router2 = LLMRouter(cfg2)

    req = httpx.Request("POST", "https://api.groq.com")
    resp_401 = httpx.Response(401, request=req, text=f'{{"error": "Invalid API key: {secret}"}}')
    auth_err = httpx.HTTPStatusError("401 Unauthorized", request=req, response=resp_401)

    with patch.object(router2, "_call_groq", side_effect=auth_err) as mock_groq2, \
         patch.object(router2, "_call_openrouter", return_value="OPENROUTER: Handled after 401."):

        res = router2.route_query("Check pack", "System prompt")
        assert res.active_provider == "OPENROUTER"
        assert mock_groq2.call_count == 1  # 401 must NOT be repeatedly retried
        assert secret not in str(res.diagnostics)  # Must be redacted


# -----------------------------------------------------------------------------
# 8. Ollama model unavailable
# -----------------------------------------------------------------------------
def test_8_ollama_model_unavailable():
    cfg = make_mock_config(primary="ollama", fallback_order="ollama")
    cfg.ollama_model = "nonexistent_model_xyz"
    router = LLMRouter(cfg)

    # Mock Ollama tags returning only tinyllama
    mock_tags_resp = MagicMock()
    mock_tags_resp.status_code = 200
    mock_tags_resp.json.return_value = {"models": [{"name": "tinyllama:latest"}]}

    with patch.object(router.client, "get", return_value=mock_tags_resp):
        result = router.route_query("Check battery status", "System prompt")

        assert result.active_provider == "RULE_BASED_FALLBACK"
        ollama_diag = result.diagnostics.get("ollama", {})
        assert "not installed in local ollama" in ollama_diag.get("reason", "").lower()


# -----------------------------------------------------------------------------
# 9. No API keys or secrets leaked in logs or error messages
# -----------------------------------------------------------------------------
def test_9_no_api_keys_or_secrets_leaked():
    test_secrets = [
        "gsk_my_super_confidential_groq_key_99999",
        "AIza_very_private_gemini_api_key_88888",
        "sk-or-v1-super_secret_openrouter_token_77777",
        "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_token"
    ]

    for secret in test_secrets:
        raw_msg = f"API request failed with credential: {secret} and body text"
        sanitized = sanitize_message(raw_msg)
        assert secret not in sanitized
        assert "REDACTED" in sanitized


# -----------------------------------------------------------------------------
# 10. Existing battery simulation and analysis remain functional
# -----------------------------------------------------------------------------
def test_10_battery_simulation_and_analysis_functional():
    sess_id = create_session()
    sim = BatterySimulator(session_id=sess_id, initial_soc=50.0)

    # Test charge operation
    sim.start_charge(50.0)
    meas1 = sim.step()
    assert meas1 is not None
    assert meas1["current"] == 50.0
    assert meas1["soc"] >= 50.0

    # Test discharge operation
    sim.start_discharge(50.0)
    meas2 = sim.step()
    assert meas2["current"] == -50.0

    # Verify SQLite database storage
    df = get_session_measurements(sess_id)
    assert len(df) >= 2

    # Verify battery health analysis
    health_text = analyze_battery_health(sess_id)
    assert "Session" in health_text
    assert "State of Health (SOH)" in health_text  # SOH disclaimer intact

    # Verify status tool
    status_text = get_battery_status()
    assert "SIMULATED DATA" in status_text
