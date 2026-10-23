"""
llm_router.py - Multi-LLM Automatic Fallback Router for EV Battery Monitoring Agent.

Priority-based LLM Fallback System:
1. Groq (Primary LLM)
2. OpenRouter (Secondary LLM)
3. Google Gemini (Third LLM)
4. Ollama (Local Offline LLM)
5. Rule-Based Fallback (Deterministic safety mode when all LLMs fail)

Features:
- Configurable priority order via LLM_FALLBACK_ORDER
- Categorized safe diagnostics (Not configured, Auth error, Rate limited, Timeout, Model unavailable, etc.)
- Model auto-validation: verifies local Ollama models before calling; auto-recovers from retired cloud model names
- Zero secret exposure: regex sanitization strips all keys/tokens from logs, errors, and UI
- Preserves battery safety interlocks and passes conversation context
"""

import os
import time
import json
import re
import logging
from enum import Enum
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, Tuple, Callable
import httpx
from dotenv import load_dotenv

# Load environment configuration
load_dotenv()

# Setup module logger
logger = logging.getLogger("LLMRouter")
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter("[%(asctime)s] [%(name)s] [%(levelname)s] %(message)s")
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)


class ProviderDiagnostic(str, Enum):
    SUCCESS = "Successful response"
    NOT_CONFIGURED = "Not configured"
    DISABLED = "Disabled"
    AUTH_ERROR = "Authentication/configuration error"
    RATE_LIMITED_OR_QUOTA = "Rate limited or quota exhausted"
    TIMEOUT_OR_NETWORK = "Timeout/network error"
    MODEL_UNAVAILABLE = "Model unavailable"
    SERVER_ERROR = "Server error"
    UNKNOWN_ERROR = "Unknown error"


@dataclass
class RouterResult:
    content: str
    active_provider: str          # GROQ, OPENROUTER, GEMINI, OLLAMA, or RULE_BASED_FALLBACK
    active_model: str
    fallback_occurred: bool = False
    fallback_reason: Optional[str] = None
    attempted_providers: List[str] = field(default_factory=list)
    diagnostics: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    tool_calls_executed: List[str] = field(default_factory=list)


class RouterConfig:
    """Manages secure configuration for all LLM providers."""

    def __init__(self):
        # 1. Groq
        self.groq_api_key = os.getenv("GROQ_API_KEY", "").strip()
        self.groq_model = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b").strip()

        # 2. OpenRouter
        self.openrouter_api_key = os.getenv("OPENROUTER_API_KEY", "").strip()
        self.openrouter_model = os.getenv("OPENROUTER_MODEL", "meta-llama/llama-3.3-70b-instruct").strip()

        # 3. Gemini (support GEMINI_API_KEY or GOOGLE_API_KEY)
        self.gemini_api_key = (
            os.getenv("GEMINI_API_KEY", "").strip() or os.getenv("GOOGLE_API_KEY", "").strip()
        )
        self.gemini_model = os.getenv("GEMINI_MODEL", "gemini-flash-latest").strip()

        # 4. Ollama
        self.ollama_base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
        self.ollama_model = os.getenv("OLLAMA_MODEL", "tinyllama:latest").strip()

        # Routing behavior (Default Priority: 1. Groq -> 2. OpenRouter -> 3. Gemini -> 4. Ollama)
        self.primary_llm = os.getenv("PRIMARY_LLM", "groq").strip().lower()

        fallback_str = os.getenv("LLM_FALLBACK_ORDER", "groq,openrouter,gemini,ollama")
        self.fallback_order = [p.strip().lower() for p in fallback_str.split(",") if p.strip()]

        try:
            self.timeout_seconds = float(os.getenv("LLM_TIMEOUT_SECONDS", "15"))
        except ValueError:
            self.timeout_seconds = 15.0

        try:
            self.max_retries = int(os.getenv("LLM_MAX_RETRIES", "2"))
        except ValueError:
            self.max_retries = 2

    def is_provider_configured(self, provider: str) -> bool:
        provider = provider.lower()
        if provider == "groq":
            return bool(self.groq_api_key and not self._is_placeholder(self.groq_api_key))
        elif provider == "openrouter":
            return bool(self.openrouter_api_key and not self._is_placeholder(self.openrouter_api_key))
        elif provider == "gemini":
            return bool(self.gemini_api_key and not self._is_placeholder(self.gemini_api_key))
        elif provider == "ollama":
            return bool(self.ollama_base_url)
        return False

    @staticmethod
    def _is_placeholder(val: str) -> bool:
        val_lower = val.lower().strip()
        return any(p in val_lower for p in ["your_", "placeholder", "here", "api_key"]) or len(val.strip()) < 8

    def get_model_name(self, provider: str) -> str:
        provider = provider.lower()
        if provider == "groq":
            return self.groq_model
        elif provider == "openrouter":
            return self.openrouter_model
        elif provider == "gemini":
            return self.gemini_model
        elif provider == "ollama":
            return self.ollama_model
        return "deterministic-v1"


def sanitize_message(msg: str, config: Optional[RouterConfig] = None) -> str:
    """Removes secret tokens and API keys from error messages, logs, and output."""
    if not msg:
        return ""
    sanitized = str(msg)
    if config:
        for secret in [config.groq_api_key, config.gemini_api_key, config.openrouter_api_key]:
            if secret and len(secret) > 6 and secret in sanitized:
                sanitized = sanitized.replace(secret, "***REDACTED_API_KEY***")

    # Generic patterns for API keys
    sanitized = re.sub(r"gsk_[a-zA-Z0-9_-]{20,}", "***REDACTED_GROQ_KEY***", sanitized)
    sanitized = re.sub(r"AIza[a-zA-Z0-9_-]{25,}", "***REDACTED_GEMINI_KEY***", sanitized)
    sanitized = re.sub(r"sk-or-v1-[a-zA-Z0-9_-]{20,}", "***REDACTED_OPENROUTER_KEY***", sanitized)
    sanitized = re.sub(r"Bearer\s+[a-zA-Z0-9_\-\.]{15,}", "Bearer ***REDACTED_TOKEN***", sanitized)
    return sanitized


def classify_error(
    status_code: Optional[int] = None,
    error_body: str = "",
    headers: Optional[Dict[str, str]] = None,
    exception: Optional[Exception] = None
) -> Tuple[ProviderDiagnostic, str, Optional[float]]:
    """
    Classifies errors into standard diagnostic categories with safe messages and retry-after hints.
    """
    body_lower = (error_body or "").lower()
    exc_str = str(exception).lower() if exception else ""
    combined = f"{body_lower} {exc_str}"

    retry_after: Optional[float] = None
    if headers:
        header_val = headers.get("retry-after") or headers.get("Retry-After")
        if header_val:
            try:
                retry_after = float(header_val)
            except ValueError:
                retry_after = None

    # 1. Rate Limit & Quota Exhaustion
    if status_code == 429 or "rate limit" in combined or "tpm" in combined or "rpm" in combined:
        return ProviderDiagnostic.RATE_LIMITED_OR_QUOTA, "Rate limit exceeded (HTTP 429)", retry_after

    if any(q in combined for q in ["insufficient_quota", "quota exceeded", "resourceexhausted", "credits exhausted", "balance"]):
        return ProviderDiagnostic.RATE_LIMITED_OR_QUOTA, "API quota exhausted or insufficient credits", None

    # 2. Authentication & Configuration Errors
    if (
        status_code in (401, 403)
        or any(a in combined for a in ["invalid api key", "api_key_invalid", "unauthorized", "authentication failed", "forbidden"])
    ):
        return ProviderDiagnostic.AUTH_ERROR, f"Authentication/configuration error (HTTP {status_code})", None

    # 3. Model Unavailable / Retired / Not Installed Locally
    if (
        (status_code == 404 and any(m in combined for m in ["model", "not found", "does not exist"]))
        or any(m in combined for m in ["model_not_found", "model not found", "no longer available", "try pulling it first", "not installed", "model unavailable", "not found in local ollama"])
    ):
        desc = f"Model unavailable: {sanitize_message(exc_str or combined[:100])}" if ("installed" in combined or "pulling" in combined) else "Model unavailable or not found"
        return ProviderDiagnostic.MODEL_UNAVAILABLE, desc, None

    # 4. Server Errors
    if status_code in (500, 502, 503, 504) or any(s in combined for s in ["service unavailable", "internal server error", "high demand"]):
        return ProviderDiagnostic.SERVER_ERROR, f"Temporary server error (HTTP {status_code})", retry_after

    # 5. Timeouts and Network Failures
    if (
        (exception and isinstance(exception, (httpx.TimeoutException, TimeoutError)))
        or "timeout" in combined
        or "timed out" in combined
    ):
        return ProviderDiagnostic.TIMEOUT_OR_NETWORK, "Connection or read timeout", None

    if (
        (exception and isinstance(exception, (httpx.ConnectError, ConnectionRefusedError)))
        or any(n in combined for n in ["failed to establish", "connection refused", "network unreachable"])
    ):
        return ProviderDiagnostic.TIMEOUT_OR_NETWORK, "Network connection failure", None

    return ProviderDiagnostic.UNKNOWN_ERROR, f"Unexpected error (HTTP {status_code}): {sanitize_message(combined[:100])}", None


class LLMRouter:
    """
    Centralized Multi-LLM Router.
    Executes queries with priority-based automatic fallback:
    1. Groq -> 2. OpenRouter -> 3. Gemini -> 4. Ollama -> 5. Rule-Based Fallback.
    """

    def __init__(self, config: Optional[RouterConfig] = None):
        self.config = config or RouterConfig()
        self.client = httpx.Client(timeout=self.config.timeout_seconds)
        self.last_active_provider = "UNINITIALIZED"
        self.last_active_model = "uninitialized"
        self.last_fallback_occurred = False
        self.last_fallback_reason: Optional[str] = None
        self.last_diagnostics: Dict[str, Dict[str, Any]] = {}

    def get_ordered_providers(self) -> List[str]:
        """Returns the fallback sequence starting with primary_llm."""
        order = []
        if self.config.primary_llm and self.config.primary_llm in self.config.fallback_order:
            order.append(self.config.primary_llm)

        for p in self.config.fallback_order:
            if p not in order:
                order.append(p)
        return order

    def _execute_with_retry(
        self,
        provider: str,
        func: Callable[[], str]
    ) -> Tuple[bool, Optional[str], ProviderDiagnostic, str]:
        """
        Executes a provider call with bounded retries and exponential backoff.
        Returns (success, result_content, diagnostic_status, safe_message).
        """
        attempts = 0
        max_retries = max(1, self.config.max_retries)

        while attempts < max_retries:
            attempts += 1
            try:
                content = func()
                if content and str(content).strip():
                    return True, str(content).strip(), ProviderDiagnostic.SUCCESS, "Successful response"
                else:
                    return False, None, ProviderDiagnostic.SERVER_ERROR, "Empty response returned"

            except httpx.HTTPStatusError as e:
                resp = e.response
                headers_dict = dict(resp.headers)
                diag, safe_msg, retry_after = classify_error(
                    status_code=resp.status_code,
                    error_body=resp.text,
                    headers=headers_dict,
                    exception=e
                )

                # Non-retryable permanent errors
                if diag in (ProviderDiagnostic.AUTH_ERROR, ProviderDiagnostic.RATE_LIMITED_OR_QUOTA, ProviderDiagnostic.MODEL_UNAVAILABLE):
                    logger.warning(f"[{provider.upper()}] Non-retryable error: {safe_msg}. Switching to next provider.")
                    return False, None, diag, safe_msg

                # Server error with bounded retry
                if attempts < max_retries and diag in (ProviderDiagnostic.SERVER_ERROR, ProviderDiagnostic.TIMEOUT_OR_NETWORK):
                    backoff = min(0.5 * (2 ** (attempts - 1)), 2.5)
                    logger.info(f"[{provider.upper()}] Transient {diag.value}. Retrying {attempts}/{max_retries} in {backoff:.1f}s...")
                    time.sleep(backoff)
                    continue

                return False, None, diag, safe_msg

            except (httpx.TimeoutException, TimeoutError) as e:
                diag, safe_msg, _ = classify_error(exception=e)
                if attempts < max_retries:
                    backoff = min(0.5 * (2 ** (attempts - 1)), 2.0)
                    logger.info(f"[{provider.upper()}] Timeout on attempt {attempts}. Retrying in {backoff:.1f}s...")
                    time.sleep(backoff)
                    continue
                return False, None, diag, safe_msg

            except Exception as e:
                diag, safe_msg, _ = classify_error(exception=e)
                if attempts < max_retries and diag == ProviderDiagnostic.TIMEOUT_OR_NETWORK:
                    time.sleep(0.5)
                    continue
                return False, None, diag, safe_msg

        return False, None, ProviderDiagnostic.UNKNOWN_ERROR, f"Exhausted {max_retries} retries"

    # -------------------------------------------------------------------------
    # Provider Implementations with Model Auto-Validation
    # -------------------------------------------------------------------------

    def _call_groq(self, prompt: str, system_prompt: str, history: Optional[List[Dict[str, str]]] = None) -> str:
        headers = {
            "Authorization": f"Bearer {self.config.groq_api_key}",
            "Content-Type": "application/json"
        }

        messages = [{"role": "system", "content": system_prompt}]
        if history:
            for h in history[-4:]:
                messages.append({"role": h.get("role", "user"), "content": h.get("content", "")})
        messages.append({"role": "user", "content": prompt})

        # Try configured model first
        models_to_try = [self.config.groq_model]
        if "openai/gpt-oss-20b" not in models_to_try:
            models_to_try.append("openai/gpt-oss-20b")

        last_resp = None
        for m in models_to_try:
            payload = {"model": m, "messages": messages, "temperature": 0.2}
            resp = self.client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers=headers,
                json=payload,
                timeout=self.config.timeout_seconds
            )
            last_resp = resp
            if resp.status_code == 200:
                data = resp.json()
                self.config.groq_model = m  # remember working model
                return data["choices"][0]["message"]["content"]
            elif resp.status_code == 404:
                # model not found, try next candidate
                continue
            else:
                resp.raise_for_status()

        if last_resp is not None:
            last_resp.raise_for_status()
        raise RuntimeError("Groq call failed without response")

    def _call_openrouter(self, prompt: str, system_prompt: str, history: Optional[List[Dict[str, str]]] = None) -> str:
        headers = {
            "Authorization": f"Bearer {self.config.openrouter_api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:8501",
            "X-Title": "EV-Battery-Agent"
        }

        messages = [{"role": "system", "content": system_prompt}]
        if history:
            for h in history[-4:]:
                messages.append({"role": h.get("role", "user"), "content": h.get("content", "")})
        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": self.config.openrouter_model,
            "messages": messages,
            "temperature": 0.2
        }
        resp = self.client.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers=headers,
            json=payload,
            timeout=self.config.timeout_seconds
        )
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"]

    def _call_gemini(self, prompt: str, system_prompt: str, history: Optional[List[Dict[str, str]]] = None) -> str:
        # Build contents including history
        contents = []
        if history:
            for h in history[-4:]:
                role = "user" if h.get("role") == "user" else "model"
                contents.append({"role": role, "parts": [{"text": h.get("content", "")}]})

        current_text = f"{system_prompt}\n\nUser Question:\n{prompt}"
        contents.append({"role": "user", "parts": [{"text": current_text}]})

        models_to_try = [self.config.gemini_model]
        if "gemini-flash-latest" not in models_to_try:
            models_to_try.append("gemini-flash-latest")
        if "gemini-3.8-flash" not in models_to_try:
            models_to_try.append("gemini-3.8-flash")

        last_resp = None
        for m in models_to_try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent?key={self.config.gemini_api_key}"
            headers = {"Content-Type": "application/json"}
            payload = {
                "contents": contents,
                "generationConfig": {"temperature": 0.2}
            }
            resp = self.client.post(url, headers=headers, json=payload, timeout=self.config.timeout_seconds)
            last_resp = resp
            if resp.status_code == 200:
                data = resp.json()
                candidates = data.get("candidates", [])
                if candidates and "content" in candidates[0]:
                    parts = candidates[0]["content"].get("parts", [])
                    if parts:
                        self.config.gemini_model = m
                        return parts[0].get("text", "")
            elif resp.status_code == 404:
                continue
            else:
                resp.raise_for_status()

        if last_resp is not None:
            last_resp.raise_for_status()
        raise RuntimeError("Gemini call failed without response")

    def _validate_and_call_ollama(
        self, prompt: str, system_prompt: str, history: Optional[List[Dict[str, str]]] = None
    ) -> str:
        """Validates Ollama service and local models before dispatching."""
        # Check service health and installed models
        try:
            tags_resp = self.client.get(f"{self.config.ollama_base_url}/api/tags", timeout=3.0)
            if tags_resp.status_code != 200:
                raise httpx.HTTPStatusError("Ollama /api/tags returned non-200", request=tags_resp.request, response=tags_resp)
            installed_models = [m.get("name") for m in tags_resp.json().get("models", [])]
        except Exception as e:
            raise ConnectionError(f"Ollama local service is offline or unreachable at {self.config.ollama_base_url}: {e}")

        if not installed_models:
            raise ValueError("No models are installed in local Ollama. Please run: ollama pull tinyllama")

        # Check if configured model is installed (or matches prefix/tag)
        cfg_model = self.config.ollama_model
        matching_model = None
        for m in installed_models:
            if cfg_model == m or cfg_model == m.split(":")[0] or cfg_model.split(":")[0] == m:
                matching_model = m
                break

        if not matching_model:
            # If configured model is missing (e.g. llama3), fail or auto-use installed model
            # To strictly obey: 'confirm the configured model exists locally', we raise if completely absent
            available_str = ", ".join(installed_models)
            # If user has tinyllama installed but configured llama3, we can raise a descriptive model_not_found error
            raise ValueError(f"Configured model '{cfg_model}' is not installed in local Ollama (Available: {available_str})")

        messages = [{"role": "system", "content": system_prompt}]
        if history:
            for h in history[-4:]:
                messages.append({"role": h.get("role", "user"), "content": h.get("content", "")})
        messages.append({"role": "user", "content": prompt})

        url = f"{self.config.ollama_base_url}/api/chat"
        payload = {
            "model": matching_model,
            "messages": messages,
            "stream": False
        }
        resp = self.client.post(url, json=payload, timeout=self.config.timeout_seconds)
        resp.raise_for_status()
        data = resp.json()
        return data.get("message", {}).get("content", "")

    # -------------------------------------------------------------------------
    # Main Routing Logic
    # -------------------------------------------------------------------------

    def route_query(
        self,
        prompt: str,
        system_prompt: str,
        tools_executor: Optional[Callable[[str], Optional[str]]] = None,
        conversation_history: Optional[List[Dict[str, str]]] = None
    ) -> RouterResult:
        """
        Routes the prompt to providers according to priority order.
        Tries every configured and enabled provider until one succeeds.
        Falls back to RULE_BASED_FALLBACK only after all providers fail.
        """
        providers_order = self.get_ordered_providers()
        attempted: List[str] = []
        diagnostics: Dict[str, Dict[str, Any]] = {}
        fallback_occurred = False
        first_failure_reason: Optional[str] = None

        tool_result = None
        executed_tools = []
        if tools_executor:
            tool_output = tools_executor(prompt)
            if tool_output:
                tool_result = tool_output
                executed_tools.append("BatteryTool")
                prompt = (
                    f"{prompt}\n\n[Battery Context - Hardware Disconnected | Provenance: SIMULATED / STORED_UNVERIFIED]:\n{tool_output}\n"
                    f"(CRITICAL INSTRUCTION: Physical hardware is disconnected. Do NOT claim these readings are 'verified', 'live hardware telemetry', 'actual battery status', or 'real-time monitoring'. Accurately state their provenance and timestamp as provided above.)"
                )

        # Iterate through providers safely
        for provider in providers_order:
            if provider in attempted:
                continue
            attempted.append(provider)
            model_name = self.config.get_model_name(provider)

            # Check configuration
            if not self.config.is_provider_configured(provider):
                diagnostics[provider] = {
                    "status": ProviderDiagnostic.NOT_CONFIGURED.value,
                    "reason": "API key missing or placeholder in .env",
                    "model": model_name
                }
                logger.info(f"Provider '{provider}' is not configured. Skipping.")
                continue

            logger.info(f"Attempting LLM Provider: {provider.upper()} ({model_name})")

            # Map to provider function
            if provider == "groq":
                caller = lambda: self._call_groq(prompt, system_prompt, conversation_history)
            elif provider == "openrouter":
                caller = lambda: self._call_openrouter(prompt, system_prompt, conversation_history)
            elif provider == "gemini":
                caller = lambda: self._call_gemini(prompt, system_prompt, conversation_history)
            elif provider == "ollama":
                caller = lambda: self._validate_and_call_ollama(prompt, system_prompt, conversation_history)
            else:
                diagnostics[provider] = {
                    "status": ProviderDiagnostic.UNKNOWN_ERROR.value,
                    "reason": "Unknown provider identifier",
                    "model": model_name
                }
                continue

            success, content, diag_enum, safe_msg = self._execute_with_retry(provider, caller)

            if success and content:
                active_prov_label = provider.upper()
                self.last_active_provider = active_prov_label
                self.last_active_model = model_name
                self.last_fallback_occurred = fallback_occurred
                self.last_fallback_reason = first_failure_reason

                diagnostics[provider] = {
                    "status": ProviderDiagnostic.SUCCESS.value,
                    "reason": "HTTP 200: Successfully returned answer",
                    "model": model_name
                }
                self.last_diagnostics = diagnostics

                return RouterResult(
                    content=content,
                    active_provider=active_prov_label,
                    active_model=model_name,
                    fallback_occurred=fallback_occurred,
                    fallback_reason=first_failure_reason,
                    attempted_providers=attempted,
                    diagnostics=diagnostics,
                    tool_calls_executed=executed_tools
                )
            else:
                fallback_occurred = True
                fail_reason = f"{provider.upper()} failed: {safe_msg}"
                diagnostics[provider] = {
                    "status": diag_enum.value,
                    "reason": safe_msg,
                    "model": model_name
                }
                if not first_failure_reason:
                    first_failure_reason = fail_reason
                logger.warning(f"Failover triggered from {provider.upper()}: {fail_reason}")

        # If all configured providers fail or none were configured
        logger.warning("All LLM providers failed or none configured. Falling back to rule-based assistant.")
        fallback_msg = (
            "⚠️ **Notice: All online LLM providers are currently unavailable or unconfigured.**\n\n"
            "Operating in safe local rule-based mode.\n"
        )

        if tool_result:
            fallback_msg += f"\n**Simulated Telemetry Analysis (Hardware Disconnected):**\n{tool_result}"
        else:
            fallback_msg += (
                "\nYou can ask:\n"
                "- `Show battery status`\n"
                "- `Analyze battery health`\n"
                "- `Compare previous tests`\n"
                "- `Generate battery report`"
            )

        self.last_active_provider = "RULE_BASED_FALLBACK"
        self.last_active_model = "deterministic-v1"
        self.last_fallback_occurred = True
        self.last_fallback_reason = first_failure_reason or "All configured LLMs unavailable"
        self.last_diagnostics = diagnostics

        return RouterResult(
            content=fallback_msg,
            active_provider="RULE_BASED_FALLBACK",
            active_model="deterministic-v1",
            fallback_occurred=True,
            fallback_reason=self.last_fallback_reason,
            attempted_providers=attempted,
            diagnostics=diagnostics,
            tool_calls_executed=executed_tools
        )
