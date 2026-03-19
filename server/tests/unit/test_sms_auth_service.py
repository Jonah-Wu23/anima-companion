from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.services.auth.sms_auth_service import SmsAuthError, SmsAuthService


def _build_service() -> SmsAuthService:
    return SmsAuthService(
        access_key_id="ak",
        access_key_secret="sk",
        sign_name="sign",
        template_code="template",
        template_param='{"code":"##code##"}',
        scheme_name="",
        country_code="86",
        interval_seconds=60,
        valid_minutes=5,
    )


def test_parse_check_response_fails_when_result_fields_missing() -> None:
    service = _build_service()
    body = SimpleNamespace(code="OK", message="OK", model=SimpleNamespace())
    assert service._parse_check_response(body=body, phone="13800000000", out_id="challenge-1") is False


def test_send_code_maps_biz_frequency_to_429(monkeypatch) -> None:
    service = _build_service()

    class FakeClient:
        def send_sms_verify_code_with_options(self, request, runtime):  # type: ignore[no-untyped-def]
            _ = request, runtime
            return SimpleNamespace(body=SimpleNamespace(code="BIZ.FREQUENCY", message="check frequency failed"))

    monkeypatch.setattr(service, "_create_client", lambda: FakeClient())
    monkeypatch.setattr(service, "_build_send_request", lambda **kwargs: (object(), object()))

    with pytest.raises(SmsAuthError) as exc_info:
        service.send_code(phone="13800000000", out_id="challenge-1")

    assert exc_info.value.http_status == 429
    assert exc_info.value.provider_code == "BIZ.FREQUENCY"
    assert exc_info.value.retry_after_sec == 60
