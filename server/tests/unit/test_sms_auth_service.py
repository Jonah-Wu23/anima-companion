from __future__ import annotations

from types import SimpleNamespace

from app.services.auth.sms_auth_service import SmsAuthService


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
