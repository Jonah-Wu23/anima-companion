from __future__ import annotations

from dataclasses import replace

from fastapi.testclient import TestClient

from app.core.settings import get_settings
from app.dependencies import get_auth_store, get_captcha_verifier, get_sms_auth_service
from app.main import app
from app.repositories.auth_store import AuthStore
from app.services.auth.captcha_verifier import CaptchaVerifyResult
from app.services.auth.sms_auth_service import SmsSendResult


class DummyCaptchaVerifier:
    def verify(self, *, captcha_verify_param: str, scene: str) -> CaptchaVerifyResult:
        assert captcha_verify_param
        assert scene in {"login", "register", "sms"}
        return CaptchaVerifyResult(
            passed=True,
            verify_code="T001",
            request_id="req-test",
            raw_code="Success",
            raw_message="ok",
        )


class DummySmsAuthService:
    def __init__(self) -> None:
        self._codes: dict[tuple[str, str], str] = {}

    def send_code(self, *, phone: str, out_id: str) -> SmsSendResult:
        self._codes[(phone, out_id)] = "123456"
        return SmsSendResult(provider_biz_id="biz-test", retry_after_sec=60)

    def verify_code(self, *, phone: str, out_id: str, verify_code: str) -> bool:
        expected = self._codes.get((phone, out_id))
        return expected is not None and verify_code == expected


def _override_deps(tmp_path) -> tuple[AuthStore, DummySmsAuthService]:
    base_settings = get_settings()
    test_settings = replace(
        base_settings,
        auth_cookie_name="anima_sid_test",
        auth_cookie_secure=False,
    )
    store = AuthStore(
        db_path=tmp_path / "auth.db",
        session_secret="test-secret",
        session_ttl_seconds=3600,
    )
    sms_service = DummySmsAuthService()
    app.dependency_overrides[get_auth_store] = lambda: store
    app.dependency_overrides[get_settings] = lambda: test_settings
    app.dependency_overrides[get_captcha_verifier] = lambda: DummyCaptchaVerifier()
    app.dependency_overrides[get_sms_auth_service] = lambda: sms_service
    return store, sms_service


def test_auth_register_me_logout_flow(tmp_path) -> None:
    _override_deps(tmp_path)
    try:
        with TestClient(app) as client:
            send_sms_resp = client.post(
                "/v1/auth/sms/send",
                json={
                    "phone": "13800000001",
                    "scene": "register",
                    "captcha_verify_param": "captcha-register-param",
                },
            )
            assert send_sms_resp.status_code == 200
            challenge_id = send_sms_resp.json()["sms_challenge_id"]

            register_resp = client.post(
                "/v1/auth/register",
                json={
                    "phone": "13800000001",
                    "sms_challenge_id": challenge_id,
                    "sms_code": "123456",
                    "password": "Password123",
                    "captcha_verify_param": "captcha-register-param",
                },
            )
            assert register_resp.status_code == 200
            assert register_resp.json()["user"]["account"] == "13800000001"

            me_resp = client.get("/v1/auth/me")
            assert me_resp.status_code == 200
            assert me_resp.json()["user"]["account"] == "13800000001"

            logout_resp = client.post("/v1/auth/logout")
            assert logout_resp.status_code == 200
            assert logout_resp.json() == {"ok": True}

            me_after_logout_resp = client.get("/v1/auth/me")
            assert me_after_logout_resp.status_code == 401
            assert me_after_logout_resp.json()["detail"] == "未登录"
    finally:
        app.dependency_overrides.clear()


def test_auth_password_and_sms_login_flow(tmp_path) -> None:
    _override_deps(tmp_path)
    try:
        with TestClient(app) as client:
            send_register_sms_resp = client.post(
                "/v1/auth/sms/send",
                json={
                    "phone": "13800000002",
                    "scene": "register",
                    "captcha_verify_param": "captcha-register-param",
                },
            )
            challenge_register = send_register_sms_resp.json()["sms_challenge_id"]
            register_resp = client.post(
                "/v1/auth/register",
                json={
                    "phone": "13800000002",
                    "sms_challenge_id": challenge_register,
                    "sms_code": "123456",
                    "password": "Password123",
                    "captcha_verify_param": "captcha-register-param",
                },
            )
            assert register_resp.status_code == 200

            client.post("/v1/auth/logout")

            password_login_resp = client.post(
                "/v1/auth/login/password",
                json={
                    "account": "13800000002",
                    "password": "Password123",
                    "captcha_verify_param": "captcha-login-param",
                },
            )
            assert password_login_resp.status_code == 200
            assert password_login_resp.json()["user"]["account"] == "13800000002"

            client.post("/v1/auth/logout")

            send_login_sms_resp = client.post(
                "/v1/auth/sms/send",
                json={
                    "phone": "13800000002",
                    "scene": "login",
                    "captcha_verify_param": "captcha-sms-param",
                },
            )
            challenge_login = send_login_sms_resp.json()["sms_challenge_id"]
            sms_login_resp = client.post(
                "/v1/auth/login/sms",
                json={
                    "phone": "13800000002",
                    "sms_challenge_id": challenge_login,
                    "sms_code": "123456",
                    "captcha_verify_param": "captcha-login-param",
                },
            )
            assert sms_login_resp.status_code == 200
            assert sms_login_resp.json()["user"]["account"] == "13800000002"
    finally:
        app.dependency_overrides.clear()
