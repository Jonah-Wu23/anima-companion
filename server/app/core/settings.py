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
