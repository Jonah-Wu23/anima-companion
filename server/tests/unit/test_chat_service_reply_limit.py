from __future__ import annotations

from app.services.dialogue.chat_service import _resolve_assistant_text_limit, _sanitize_assistant_text


def test_sanitize_assistant_text_removes_stage_direction() -> None:
    raw = "（轻声）今天先休息，晚点再聊。"
    assert _sanitize_assistant_text(raw) == "今天先休息，晚点再聊。"


def test_sanitize_assistant_text_limits_to_50_chars_without_punctuation() -> None:
    raw = "甲" * 60
    sanitized = _sanitize_assistant_text(raw)
    assert len(sanitized) == 50
    assert sanitized == ("甲" * 49) + "…"


def test_sanitize_assistant_text_prefers_comma_or_period_when_truncating() -> None:
    raw = ("甲" * 45) + "，" + ("乙" * 20)
    sanitized = _sanitize_assistant_text(raw)
    assert sanitized == ("甲" * 45) + "…"


def test_resolve_assistant_text_limit_for_luotianyi_is_60() -> None:
    assert _resolve_assistant_text_limit("luotianyi") == 60


def test_sanitize_assistant_text_falls_back_when_reply_is_pure_narration() -> None:
    raw = "他耳尖微微泛红，笑着挠了挠后脑勺，脚步已经往市集方向迈去。"
    assert _sanitize_assistant_text(raw) == "我在。"


def test_sanitize_assistant_text_extracts_quoted_dialogue_from_narration() -> None:
    raw = "她轻轻偏过头，小声说：“好呀，我们一起去。”"
    assert _sanitize_assistant_text(raw) == "好呀，我们一起去。"
