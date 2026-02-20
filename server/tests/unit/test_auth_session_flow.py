from __future__ import annotations

import sqlite3
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


class IntegrityInjectingConnection(sqlite3.Connection):
    inject_once = False
    conflict_user_id: int | None = None

    def execute(self, sql: str, parameters=(), /):  # type: ignore[override]
        compact_sql = " ".join(sql.strip().lower().split())
        if (
            type(self).inject_once
            and "insert into auth_identities" in compact_sql
            and isinstance(parameters, (tuple, list))
            and len(parameters) >= 6
        ):
            type(self).inject_once = False
            conflict_user_id = type(self).conflict_user_id
            assert conflict_user_id is not None
            identity_type = str(parameters[1])
            identity_value = str(parameters[2])
            super().execute(
                """
                INSERT INTO auth_identities(
                  user_id, identity_type, identity_value, is_verified, created_at, updated_at
                ) VALUES(?, ?, ?, 1, 1700000000, 1700000000)
                """,
                (conflict_user_id, identity_type, identity_value),
            )
            raise sqlite3.IntegrityError(
                "UNIQUE constraint failed: auth_identities.identity_type, auth_identities.identity_value"
            )
        return super().execute(sql, parameters)


class IntegrityInjectingAuthStore(AuthStore):
    def _connect(self) -> sqlite3.Connection:  # type: ignore[override]
        conn = sqlite3.connect(self._db_path, factory=IntegrityInjectingConnection)
        conn.row_factory = sqlite3.Row
        return conn


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


def _override_deps_with_store(store: AuthStore) -> DummySmsAuthService:
    base_settings = get_settings()
    test_settings = replace(
        base_settings,
        auth_cookie_name="anima_sid_test",
        auth_cookie_secure=False,
    )
    sms_service = DummySmsAuthService()
    app.dependency_overrides[get_auth_store] = lambda: store
    app.dependency_overrides[get_settings] = lambda: test_settings
    app.dependency_overrides[get_captcha_verifier] = lambda: DummyCaptchaVerifier()
    app.dependency_overrides[get_sms_auth_service] = lambda: sms_service
    return sms_service


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


def test_auth_identities_me_requires_login(tmp_path) -> None:
    _override_deps(tmp_path)
    try:
        with TestClient(app) as client:
            resp = client.get("/v1/auth/identities/me")
            assert resp.status_code == 401
            assert resp.json()["detail"] == "未登录"
    finally:
        app.dependency_overrides.clear()


def test_auth_identities_me_returns_phone_and_email(tmp_path) -> None:
    _override_deps(tmp_path)
    try:
        with TestClient(app) as client:
            send_sms_resp = client.post(
                "/v1/auth/sms/send",
                json={
                    "phone": "13800000011",
                    "scene": "register",
                    "captcha_verify_param": "captcha-register-param",
                },
            )
            challenge_id = send_sms_resp.json()["sms_challenge_id"]
            register_resp = client.post(
                "/v1/auth/register",
                json={
                    "phone": "13800000011",
                    "sms_challenge_id": challenge_id,
                    "sms_code": "123456",
                    "password": "Password123",
                    "captcha_verify_param": "captcha-register-param",
                },
            )
            assert register_resp.status_code == 200

            bind_email_resp = client.post(
                "/v1/auth/bind/email",
                json={
                    "email": "identities@example.com",
                    "captcha_verify_param": "captcha-login-param",
                },
            )
            assert bind_email_resp.status_code == 200

            identities_resp = client.get("/v1/auth/identities/me")
            assert identities_resp.status_code == 200
            assert identities_resp.json() == {
                "phone": {"value": "13800000011", "is_verified": True},
                "email": {"value": "identities@example.com", "is_verified": True},
            }
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


def test_auth_email_register_and_login_flow(tmp_path) -> None:
    _override_deps(tmp_path)
    try:
        with TestClient(app) as client:
            register_resp = client.post(
                "/v1/auth/register/email",
                json={
                    "email": "  User.Email@Example.com  ",
                    "password": "Password123",
                    "captcha_verify_param": "captcha-register-param",
                },
            )
            assert register_resp.status_code == 200
            register_payload = register_resp.json()
            assert register_payload["user"]["account"].startswith("email_")

            client.post("/v1/auth/logout")

            login_resp = client.post(
                "/v1/auth/login/email",
                json={
                    "email": "user.email@example.com",
                    "password": "Password123",
                    "captcha_verify_param": "captcha-login-param",
                },
            )
            assert login_resp.status_code == 200
            assert login_resp.json()["user"]["account"] == register_payload["user"]["account"]
    finally:
        app.dependency_overrides.clear()


def test_auth_email_register_duplicate_returns_409(tmp_path) -> None:
    _override_deps(tmp_path)
    try:
        with TestClient(app) as client:
            first_register_resp = client.post(
                "/v1/auth/register/email",
                json={
                    "email": "same@example.com",
                    "password": "Password123",
                    "captcha_verify_param": "captcha-register-param",
                },
            )
            assert first_register_resp.status_code == 200

            duplicate_register_resp = client.post(
                "/v1/auth/register/email",
                json={
                    "email": "SAME@example.com",
                    "password": "Password123",
                    "captcha_verify_param": "captcha-register-param",
                },
            )
            assert duplicate_register_resp.status_code == 409
            assert duplicate_register_resp.json()["detail"] == "邮箱已存在"
    finally:
        app.dependency_overrides.clear()


def test_auth_email_login_wrong_password_returns_generic_error(tmp_path) -> None:
    _override_deps(tmp_path)
    try:
        with TestClient(app) as client:
            register_resp = client.post(
                "/v1/auth/register/email",
                json={
                    "email": "login.test@example.com",
                    "password": "Password123",
                    "captcha_verify_param": "captcha-register-param",
                },
            )
            assert register_resp.status_code == 200

            client.post("/v1/auth/logout")

            login_resp = client.post(
                "/v1/auth/login/email",
                json={
                    "email": "login.test@example.com",
                    "password": "WrongPassword123",
                    "captcha_verify_param": "captcha-login-param",
                },
            )
            assert login_resp.status_code == 401
            assert login_resp.json()["detail"] == "账号或密码错误"
    finally:
        app.dependency_overrides.clear()


def test_bind_email_allows_email_password_login_for_phone_account(tmp_path) -> None:
    _override_deps(tmp_path)
    try:
        with TestClient(app) as client:
            register_phone_resp = client.post(
                "/v1/auth/register",
                json={
                    "phone": "13800000003",
                    "sms_challenge_id": client.post(
                        "/v1/auth/sms/send",
                        json={
                            "phone": "13800000003",
                            "scene": "register",
                            "captcha_verify_param": "captcha-register-param",
                        },
                    ).json()["sms_challenge_id"],
                    "sms_code": "123456",
                    "password": "Password123",
                    "captcha_verify_param": "captcha-register-param",
                },
            )
            assert register_phone_resp.status_code == 200

            bind_email_resp = client.post(
                "/v1/auth/bind/email",
                json={
                    "email": "bind.phone.user@example.com",
                    "captcha_verify_param": "captcha-login-param",
                },
            )
            assert bind_email_resp.status_code == 200

            client.post("/v1/auth/logout")

            email_login_resp = client.post(
                "/v1/auth/login/email",
                json={
                    "email": "bind.phone.user@example.com",
                    "password": "Password123",
                    "captcha_verify_param": "captcha-login-param",
                },
            )
            assert email_login_resp.status_code == 200
            assert email_login_resp.json()["user"]["account"] == "13800000003"
    finally:
        app.dependency_overrides.clear()


def test_bind_phone_allows_sms_login_for_email_account(tmp_path) -> None:
    _override_deps(tmp_path)
    try:
        with TestClient(app) as client:
            register_email_resp = client.post(
                "/v1/auth/register/email",
                json={
                    "email": "bind.email.user@example.com",
                    "password": "Password123",
                    "captcha_verify_param": "captcha-register-param",
                },
            )
            assert register_email_resp.status_code == 200
            account = register_email_resp.json()["user"]["account"]

            bind_sms_challenge = client.post(
                "/v1/auth/sms/send",
                json={
                    "phone": "13800000004",
                    "scene": "login",
                    "captcha_verify_param": "captcha-login-param",
                },
            ).json()["sms_challenge_id"]
            bind_phone_resp = client.post(
                "/v1/auth/bind/phone",
                json={
                    "phone": "13800000004",
                    "sms_challenge_id": bind_sms_challenge,
                    "sms_code": "123456",
                    "captcha_verify_param": "captcha-login-param",
                },
            )
            assert bind_phone_resp.status_code == 200

            client.post("/v1/auth/logout")

            login_sms_challenge = client.post(
                "/v1/auth/sms/send",
                json={
                    "phone": "13800000004",
                    "scene": "login",
                    "captcha_verify_param": "captcha-login-param",
                },
            ).json()["sms_challenge_id"]
            login_sms_resp = client.post(
                "/v1/auth/login/sms",
                json={
                    "phone": "13800000004",
                    "sms_challenge_id": login_sms_challenge,
                    "sms_code": "123456",
                    "captcha_verify_param": "captcha-login-param",
                },
            )
            assert login_sms_resp.status_code == 200
            assert login_sms_resp.json()["user"]["account"] == account
    finally:
        app.dependency_overrides.clear()


def test_bind_email_conflict_returns_409(tmp_path) -> None:
    _override_deps(tmp_path)
    try:
        with TestClient(app) as client:
            register_phone_resp = client.post(
                "/v1/auth/register",
                json={
                    "phone": "13800000005",
                    "sms_challenge_id": client.post(
                        "/v1/auth/sms/send",
                        json={
                            "phone": "13800000005",
                            "scene": "register",
                            "captcha_verify_param": "captcha-register-param",
                        },
                    ).json()["sms_challenge_id"],
                    "sms_code": "123456",
                    "password": "Password123",
                    "captcha_verify_param": "captcha-register-param",
                },
            )
            assert register_phone_resp.status_code == 200
            client.post("/v1/auth/logout")

            register_email_resp = client.post(
                "/v1/auth/register/email",
                json={
                    "email": "conflict@example.com",
                    "password": "Password123",
                    "captcha_verify_param": "captcha-register-param",
                },
            )
            assert register_email_resp.status_code == 200
            client.post("/v1/auth/logout")

            relogin_phone_resp = client.post(
                "/v1/auth/login/password",
                json={
                    "account": "13800000005",
                    "password": "Password123",
                    "captcha_verify_param": "captcha-login-param",
                },
            )
            assert relogin_phone_resp.status_code == 200

            bind_email_resp = client.post(
                "/v1/auth/bind/email",
                json={
                    "email": "conflict@example.com",
                    "captcha_verify_param": "captcha-login-param",
                },
            )
            assert bind_email_resp.status_code == 409
            assert bind_email_resp.json()["detail"] == "邮箱已被其他账号绑定"
    finally:
        app.dependency_overrides.clear()


def test_bind_phone_conflict_returns_409(tmp_path) -> None:
    _override_deps(tmp_path)
    try:
        with TestClient(app) as client:
            register_phone_resp = client.post(
                "/v1/auth/register",
                json={
                    "phone": "13800000006",
                    "sms_challenge_id": client.post(
                        "/v1/auth/sms/send",
                        json={
                            "phone": "13800000006",
                            "scene": "register",
                            "captcha_verify_param": "captcha-register-param",
                        },
                    ).json()["sms_challenge_id"],
                    "sms_code": "123456",
                    "password": "Password123",
                    "captcha_verify_param": "captcha-register-param",
                },
            )
            assert register_phone_resp.status_code == 200
            client.post("/v1/auth/logout")

            register_email_resp = client.post(
                "/v1/auth/register/email",
                json={
                    "email": "conflict.phone@example.com",
                    "password": "Password123",
                    "captcha_verify_param": "captcha-register-param",
                },
            )
            assert register_email_resp.status_code == 200

            bind_phone_resp = client.post(
                "/v1/auth/bind/phone",
                json={
                    "phone": "13800000006",
                    "sms_challenge_id": client.post(
                        "/v1/auth/sms/send",
                        json={
                            "phone": "13800000006",
                            "scene": "login",
                            "captcha_verify_param": "captcha-login-param",
                        },
                    ).json()["sms_challenge_id"],
                    "sms_code": "123456",
                    "captcha_verify_param": "captcha-login-param",
                },
            )
            assert bind_phone_resp.status_code == 409
            assert bind_phone_resp.json()["detail"] == "手机号已被其他账号绑定"
    finally:
        app.dependency_overrides.clear()


def test_bind_email_integrity_error_returns_409_instead_of_500(tmp_path) -> None:
    store = IntegrityInjectingAuthStore(
        db_path=tmp_path / "auth.db",
        session_secret="test-secret",
        session_ttl_seconds=3600,
    )
    _override_deps_with_store(store)
    try:
        with TestClient(app) as client:
            first_register_resp = client.post(
                "/v1/auth/register",
                json={
                    "phone": "13800000021",
                    "sms_challenge_id": client.post(
                        "/v1/auth/sms/send",
                        json={
                            "phone": "13800000021",
                            "scene": "register",
                            "captcha_verify_param": "captcha-register-param",
                        },
                    ).json()["sms_challenge_id"],
                    "sms_code": "123456",
                    "password": "Password123",
                    "captcha_verify_param": "captcha-register-param",
                },
            )
            assert first_register_resp.status_code == 200
            owner_user_id = int(first_register_resp.json()["user"]["id"])
            client.post("/v1/auth/logout")

            second_register_resp = client.post(
                "/v1/auth/register",
                json={
                    "phone": "13800000022",
                    "sms_challenge_id": client.post(
                        "/v1/auth/sms/send",
                        json={
                            "phone": "13800000022",
                            "scene": "register",
                            "captcha_verify_param": "captcha-register-param",
                        },
                    ).json()["sms_challenge_id"],
                    "sms_code": "123456",
                    "password": "Password123",
                    "captcha_verify_param": "captcha-register-param",
                },
            )
            assert second_register_resp.status_code == 200

            IntegrityInjectingConnection.conflict_user_id = owner_user_id
            IntegrityInjectingConnection.inject_once = True
            bind_email_resp = client.post(
                "/v1/auth/bind/email",
                json={
                    "email": "race-conflict@example.com",
                    "captcha_verify_param": "captcha-login-param",
                },
            )
            assert bind_email_resp.status_code == 409
            assert bind_email_resp.json()["detail"] == "邮箱已被其他账号绑定"
    finally:
        IntegrityInjectingConnection.inject_once = False
        IntegrityInjectingConnection.conflict_user_id = None
        app.dependency_overrides.clear()


def test_auth_store_startup_migration_backfills_auth_identities(tmp_path) -> None:
    db_path = tmp_path / "legacy_auth.db"
    with sqlite3.connect(db_path) as conn:
        conn.executescript(
            """
            CREATE TABLE auth_users (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              account TEXT NOT NULL UNIQUE,
              email TEXT,
              password_hash TEXT NOT NULL,
              created_at INTEGER NOT NULL
            );

            INSERT INTO auth_users(account, email, password_hash, created_at)
            VALUES
              ('13800000010', NULL, 'legacy-hash-a', 1700000001),
              ('legacy_user_2', 'legacy@example.com', 'legacy-hash-b', 1700000002);
            """
        )
    store = AuthStore(
        db_path=db_path,
        session_secret="test-secret",
        session_ttl_seconds=3600,
    )
    phone_user = store.get_user_by_phone("13800000010")
    assert phone_user is not None
    assert phone_user.account == "13800000010"
    email_user = store.get_user_by_email("legacy@example.com")
    assert email_user is not None
    assert email_user.account == "legacy_user_2"

    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        table_columns = {
            str(row["name"]).lower()
            for row in conn.execute("PRAGMA table_info(auth_users)").fetchall()
        }
        index_names = {
            str(row["name"])
            for row in conn.execute("PRAGMA index_list(auth_identities)").fetchall()
        }
    assert "email" in table_columns
    assert "idx_auth_identities_type_value" in index_names
    assert "idx_auth_identities_user_type" in index_names
