from __future__ import annotations

from app.services.asr.asr_service import ASRServiceError, transcribe_with_fallback
from app.services.tts.tts_service import TTSServiceError, synthesize_with_fallback


def test_asr_fallback_to_fun_asr_when_sensevoice_failed(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.services.asr.asr_service._resolve_asr_provider_priority",
        lambda: ["sensevoice_http", "fun_asr_realtime"],
    )
    monkeypatch.setattr(
        "app.services.asr.asr_service.should_skip_provider",
        lambda _provider: (False, 0.0),
    )
    monkeypatch.setattr(
        "app.services.asr.asr_service._probe_provider_if_needed",
        lambda _provider: (True, "ok"),
    )
    monkeypatch.setattr("app.services.asr.asr_service.mark_provider_failure", lambda *_args, **_kwargs: None)
    monkeypatch.setattr("app.services.asr.asr_service.mark_provider_success", lambda *_args, **_kwargs: None)

    def fake_transcribe(*, provider: str, audio_bytes: bytes, filename: str, lang: str | None) -> str:
        _ = audio_bytes, filename, lang
        if provider == "sensevoice_http":
            raise ASRServiceError("sensevoice down")
        return "你好，世界"

    monkeypatch.setattr(
        "app.services.asr.asr_service._transcribe_with_provider",
        fake_transcribe,
    )

    result = transcribe_with_fallback(b"\x00\x01", "voice.wav", "zh")
    assert result.provider == "fun_asr_realtime"
    assert result.text == "你好，世界"


def test_tts_fallback_to_qwen_clone_when_gpt_sovits_failed(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.services.tts.tts_service._resolve_tts_provider_priority",
        lambda force_provider="": ["gpt_sovits", "qwen_clone_tts"] if not force_provider else [force_provider],
    )
    monkeypatch.setattr(
        "app.services.tts.tts_service.should_skip_provider",
        lambda _provider: (False, 0.0),
    )
    monkeypatch.setattr(
        "app.services.tts.tts_service._probe_provider_if_needed",
        lambda _provider: (True, "ok"),
    )
    monkeypatch.setattr("app.services.tts.tts_service.mark_provider_failure", lambda *_args, **_kwargs: None)
    monkeypatch.setattr("app.services.tts.tts_service.mark_provider_success", lambda *_args, **_kwargs: None)

    def fake_synthesize(*, provider: str, text: str, gpt_sovits_payload: dict | None):
        _ = text, gpt_sovits_payload
        if provider == "gpt_sovits":
            raise TTSServiceError("gpt sovits unavailable")
        from app.services.tts.tts_service import TTSSynthesizeResult

        return TTSSynthesizeResult(
            audio_bytes=b"audio",
            media_type="audio/mpeg",
            provider="qwen_clone_tts",
            voice_id="voice-x",
        )

    monkeypatch.setattr(
        "app.services.tts.tts_service._synthesize_with_provider",
        fake_synthesize,
    )

    result = synthesize_with_fallback(text="你好")
    assert result.provider == "qwen_clone_tts"
    assert result.voice_id == "voice-x"
    assert result.audio_bytes == b"audio"
