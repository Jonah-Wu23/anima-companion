"""服务端运行时配置。"""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path


def _to_int(value: str, fallback: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def _to_float(value: str, fallback: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def _to_optional_float(value: str | None) -> float | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def _to_bool(value: str, fallback: bool) -> bool:
    if value is None:
        return fallback
    normalized = str(value).strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return fallback


def _to_csv_list(value: str | None, fallback: list[str]) -> list[str]:
    if value is None:
        return fallback
    parsed = [item.strip() for item in value.split(",") if item.strip()]
    return parsed or fallback


def _to_path_list(value: str | None, fallback: list[str]) -> list[str]:
    if value is None:
        return fallback
    text = str(value).strip()
    if not text:
        return fallback
    separator = "|" if "|" in text else ","
    parsed = [
        item.strip().strip('"').strip("'")
        for item in text.split(separator)
        if item.strip().strip('"').strip("'")
    ]
    return parsed or fallback


@dataclass(frozen=True)
class Settings:
    server_root: Path
    repo_root: Path
    configs_root: Path
    sqlite_db_path: Path
    llm_api_base_url: str
    llm_api_key: str
    llm_model: str
    llm_timeout_seconds: float
    llm_max_tokens: int
    asr_base_url: str
    asr_timeout_seconds: float
    default_asr_lang: str
    asr_provider_priority: tuple[str, ...]
    tts_provider_priority: tuple[str, ...]
    provider_failure_cooldown_seconds: float
    provider_probe_interval_seconds: float
    provider_probe_timeout_seconds: float
    dashscope_api_key: str
    dashscope_base_websocket_api_url: str
    qwen_voice_customization_url: str
    qwen_tts_realtime_ws_url: str
    fun_asr_model: str
    fun_asr_sample_rate: int
    fun_asr_format: str
    fun_asr_semantic_punctuation_enabled: bool
    fun_asr_max_sentence_silence: int
    fun_asr_multi_threshold_mode_enabled: bool
    fun_asr_heartbeat: bool
    fun_asr_language_hints: tuple[str, ...]
    fun_asr_vocabulary_id: str
    fun_asr_speech_noise_threshold: float | None
    dialogue_history_limit: int
    event_inject_every_turns: int
    allow_local_chat_cache: bool
    gpt_sovits_base_url: str
    gpt_sovits_timeout_seconds: float
    gpt_sovits_default_ref_audio_path: str
    gpt_sovits_aux_ref_audio_paths: tuple[str, ...]
    gpt_sovits_default_prompt_text: str
    gpt_sovits_default_text_lang: str
    gpt_sovits_default_prompt_lang: str
    gpt_sovits_text_split_method: str
    gpt_sovits_batch_size: int
    gpt_sovits_fragment_interval: float
    gpt_sovits_speed_factor: float
    gpt_sovits_top_k: int
    gpt_sovits_top_p: float
    gpt_sovits_temperature: float
    gpt_sovits_repetition_penalty: float
    gpt_sovits_parallel_infer: bool
    gpt_sovits_split_bucket: bool
    gpt_sovits_seed: int
    cosyvoice_target_model: str
    cosyvoice_voice_id: str
    cosyvoice_voice_prefix: str
    cosyvoice_voice_alias: str
    cosyvoice_enroll_audio_url: str
    cosyvoice_auto_enroll: bool
    cosyvoice_poll_interval_seconds: float
    cosyvoice_poll_max_attempts: int
    cosyvoice_language_hints: tuple[str, ...]
    cosyvoice_registry_path: Path
    cors_allow_origins: tuple[str, ...]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    server_root = Path(__file__).resolve().parents[2]
    repo_root = Path(__file__).resolve().parents[3]
    configs_root = Path(os.getenv("CONFIGS_ROOT", str(repo_root / "configs")))
    sqlite_db_path = Path(
        os.getenv(
            "SQLITE_DB_PATH",
            str(server_root / ".data" / "companion.db"),
        )
    )
    return Settings(
        server_root=server_root,
        repo_root=repo_root,
        configs_root=configs_root,
        sqlite_db_path=sqlite_db_path,
        llm_api_base_url=os.getenv("LLM_API_BASE_URL", "https://api.gptsapi.net"),
        llm_api_key=os.getenv("LLM_API_KEY", ""),
        llm_model=os.getenv("LLM_MODEL", "claude-sonnet-4-5-20250929"),
        llm_timeout_seconds=_to_float(os.getenv("LLM_TIMEOUT_SECONDS", "45"), 45.0),
        llm_max_tokens=_to_int(os.getenv("LLM_MAX_TOKENS", "512"), 512),
        asr_base_url=os.getenv("SENSEVOICE_BASE_URL", "http://127.0.0.1:50000"),
        asr_timeout_seconds=_to_float(os.getenv("SENSEVOICE_TIMEOUT_SECONDS", "30"), 30.0),
        default_asr_lang=os.getenv("SENSEVOICE_DEFAULT_LANG", "zh"),
        asr_provider_priority=tuple(
            _to_csv_list(
                os.getenv("ASR_PROVIDER_PRIORITY"),
                ["sensevoice_http", "fun_asr_realtime"],
            )
        ),
        tts_provider_priority=tuple(
            _to_csv_list(
                os.getenv("TTS_PROVIDER_PRIORITY"),
                ["qwen_clone_tts", "gpt_sovits"],
            )
        ),
        provider_failure_cooldown_seconds=_to_float(
            os.getenv("PROVIDER_FAILURE_COOLDOWN_SECONDS", "30"),
            30.0,
        ),
        provider_probe_interval_seconds=_to_float(
            os.getenv("PROVIDER_PROBE_INTERVAL_SECONDS", "10"),
            10.0,
        ),
        provider_probe_timeout_seconds=_to_float(
            os.getenv("PROVIDER_PROBE_TIMEOUT_SECONDS", "2"),
            2.0,
        ),
        dashscope_api_key=os.getenv("DASHSCOPE_API_KEY", ""),
        dashscope_base_websocket_api_url=os.getenv(
            "DASHSCOPE_BASE_WEBSOCKET_API_URL",
            "wss://dashscope.aliyuncs.com/api-ws/v1/inference",
        ),
        qwen_voice_customization_url=os.getenv(
            "QWEN_VOICE_CUSTOMIZATION_URL",
            "https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization",
        ),
        qwen_tts_realtime_ws_url=os.getenv(
            "QWEN_TTS_REALTIME_WS_URL",
            "wss://dashscope.aliyuncs.com/api-ws/v1/realtime",
        ),
        fun_asr_model=os.getenv("FUN_ASR_MODEL", "fun-asr-realtime"),
        fun_asr_sample_rate=_to_int(os.getenv("FUN_ASR_SAMPLE_RATE", "16000"), 16000),
        fun_asr_format=os.getenv("FUN_ASR_FORMAT", "pcm"),
        fun_asr_semantic_punctuation_enabled=_to_bool(
            os.getenv("FUN_ASR_SEMANTIC_PUNCTUATION_ENABLED", "false"),
            False,
        ),
        fun_asr_max_sentence_silence=_to_int(
            os.getenv("FUN_ASR_MAX_SENTENCE_SILENCE", "1300"),
            1300,
        ),
        fun_asr_multi_threshold_mode_enabled=_to_bool(
            os.getenv("FUN_ASR_MULTI_THRESHOLD_MODE_ENABLED", "false"),
            False,
        ),
        fun_asr_heartbeat=_to_bool(os.getenv("FUN_ASR_HEARTBEAT", "false"), False),
        fun_asr_language_hints=tuple(
            _to_csv_list(os.getenv("FUN_ASR_LANGUAGE_HINTS"), ["zh", "en"])
        ),
        fun_asr_vocabulary_id=os.getenv("FUN_ASR_VOCABULARY_ID", ""),
        fun_asr_speech_noise_threshold=_to_optional_float(
            os.getenv("FUN_ASR_SPEECH_NOISE_THRESHOLD")
        ),
        dialogue_history_limit=_to_int(os.getenv("DIALOGUE_HISTORY_LIMIT", "12"), 12),
        event_inject_every_turns=_to_int(os.getenv("EVENT_INJECT_EVERY_TURNS", "5"), 5),
        allow_local_chat_cache=_to_bool(os.getenv("ALLOW_LOCAL_CHAT_CACHE", "true"), True),
        gpt_sovits_base_url=os.getenv("GPT_SOVITS_BASE_URL", "http://127.0.0.1:9880"),
        gpt_sovits_timeout_seconds=_to_float(
            os.getenv("GPT_SOVITS_TIMEOUT_SECONDS", "60"),
            60.0,
        ),
        gpt_sovits_default_ref_audio_path=os.getenv("GPT_SOVITS_DEFAULT_REF_AUDIO_PATH", ""),
        gpt_sovits_aux_ref_audio_paths=tuple(
            _to_path_list(os.getenv("GPT_SOVITS_AUX_REF_AUDIO_PATHS"), [])
        ),
        gpt_sovits_default_prompt_text=os.getenv("GPT_SOVITS_DEFAULT_PROMPT_TEXT", ""),
        gpt_sovits_default_text_lang=os.getenv("GPT_SOVITS_DEFAULT_TEXT_LANG", "zh"),
        gpt_sovits_default_prompt_lang=os.getenv("GPT_SOVITS_DEFAULT_PROMPT_LANG", "zh"),
        gpt_sovits_text_split_method=os.getenv("GPT_SOVITS_TEXT_SPLIT_METHOD", "cut5"),
        gpt_sovits_batch_size=_to_int(os.getenv("GPT_SOVITS_BATCH_SIZE", "1"), 1),
        gpt_sovits_fragment_interval=_to_float(
            os.getenv("GPT_SOVITS_FRAGMENT_INTERVAL", "0.3"),
            0.3,
        ),
        gpt_sovits_speed_factor=_to_float(os.getenv("GPT_SOVITS_SPEED_FACTOR", "1.0"), 1.0),
        gpt_sovits_top_k=_to_int(os.getenv("GPT_SOVITS_TOP_K", "5"), 5),
        gpt_sovits_top_p=_to_float(os.getenv("GPT_SOVITS_TOP_P", "1"), 1.0),
        gpt_sovits_temperature=_to_float(os.getenv("GPT_SOVITS_TEMPERATURE", "1"), 1.0),
        gpt_sovits_repetition_penalty=_to_float(
            os.getenv("GPT_SOVITS_REPETITION_PENALTY", "1.35"),
            1.35,
        ),
        gpt_sovits_parallel_infer=_to_bool(os.getenv("GPT_SOVITS_PARALLEL_INFER", "true"), True),
        gpt_sovits_split_bucket=_to_bool(os.getenv("GPT_SOVITS_SPLIT_BUCKET", "true"), True),
        gpt_sovits_seed=_to_int(os.getenv("GPT_SOVITS_SEED", "-1"), -1),
        cosyvoice_target_model=os.getenv(
            "QWEN_TTS_TARGET_MODEL",
            os.getenv("COSYVOICE_TARGET_MODEL", "qwen3-tts-vc-realtime-2026-01-15"),
        ),
        cosyvoice_voice_id=os.getenv("QWEN_VOICE_ID", os.getenv("COSYVOICE_VOICE_ID", "")),
        cosyvoice_voice_prefix=os.getenv(
            "QWEN_VOICE_PREFIX",
            os.getenv("COSYVOICE_VOICE_PREFIX", "phainon"),
        ),
        cosyvoice_voice_alias=os.getenv(
            "QWEN_VOICE_ALIAS",
            os.getenv("COSYVOICE_VOICE_ALIAS", "default"),
        ),
        cosyvoice_enroll_audio_url=os.getenv(
            "QWEN_ENROLL_AUDIO_URL",
            os.getenv("COSYVOICE_ENROLL_AUDIO_URL", ""),
        ),
        cosyvoice_auto_enroll=_to_bool(
            os.getenv("QWEN_AUTO_ENROLL", os.getenv("COSYVOICE_AUTO_ENROLL", "false")),
            False,
        ),
        cosyvoice_poll_interval_seconds=_to_float(
            os.getenv(
                "QWEN_POLL_INTERVAL_SECONDS",
                os.getenv("COSYVOICE_POLL_INTERVAL_SECONDS", "5"),
            ),
            5.0,
        ),
        cosyvoice_poll_max_attempts=_to_int(
            os.getenv(
                "QWEN_POLL_MAX_ATTEMPTS",
                os.getenv("COSYVOICE_POLL_MAX_ATTEMPTS", "24"),
            ),
            24,
        ),
        cosyvoice_language_hints=tuple(
            _to_csv_list(
                os.getenv("QWEN_LANGUAGE_HINTS", os.getenv("COSYVOICE_LANGUAGE_HINTS")),
                ["zh"],
            )
        ),
        cosyvoice_registry_path=Path(
            os.getenv(
                "QWEN_REGISTRY_PATH",
                os.getenv(
                    "COSYVOICE_REGISTRY_PATH",
                    str(server_root / ".data" / "qwen_voice_registry.json"),
                ),
            )
        ),
        cors_allow_origins=tuple(
            _to_csv_list(
                os.getenv("CORS_ALLOW_ORIGINS"),
                [
                    "http://localhost:3000",
                    "http://127.0.0.1:3000",
                    "http://localhost:3001",
                    "http://127.0.0.1:3001",
                ],
            )
        ),
    )


def clear_settings_cache() -> None:
    get_settings.cache_clear()
