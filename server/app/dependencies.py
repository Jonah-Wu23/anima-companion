"""应用依赖注入。"""

from __future__ import annotations

from functools import lru_cache

from app.core.settings import get_settings
from app.repositories.auth_store import AuthStore
from app.repositories.session_store import SessionStore
from app.services.auth.captcha_verifier import CaptchaVerifier
from app.services.auth.sms_auth_service import SmsAuthService


@lru_cache(maxsize=1)
def get_session_store() -> SessionStore:
    settings = get_settings()
    return SessionStore(settings.sqlite_db_path)


@lru_cache(maxsize=1)
def get_auth_store() -> AuthStore:
    settings = get_settings()
    return AuthStore(
        db_path=settings.sqlite_db_path,
        session_secret=settings.auth_session_secret,
        session_ttl_seconds=settings.auth_session_ttl_seconds,
    )


@lru_cache(maxsize=1)
def get_captcha_verifier() -> CaptchaVerifier:
    settings = get_settings()
    return CaptchaVerifier(
        access_key_id=settings.aliyun_access_key_id,
        access_key_secret=settings.aliyun_access_key_secret,
        region=settings.auth_captcha_region,
        scene_id_login=settings.auth_captcha_scene_id_login,
        scene_id_register=settings.auth_captcha_scene_id_register,
        scene_id_sms=settings.auth_captcha_scene_id_sms,
        dual_stack=settings.auth_captcha_dual_stack,
    )


@lru_cache(maxsize=1)
def get_sms_auth_service() -> SmsAuthService:
    settings = get_settings()
    return SmsAuthService(
        access_key_id=settings.aliyun_access_key_id,
        access_key_secret=settings.aliyun_access_key_secret,
        sign_name=settings.auth_sms_sign_name,
        template_code=settings.auth_sms_template_code,
        template_param=settings.auth_sms_template_param,
        scheme_name=settings.auth_sms_scheme_name,
        country_code=settings.auth_sms_country_code,
        interval_seconds=settings.auth_sms_interval_seconds,
        valid_minutes=settings.auth_sms_valid_minutes,
    )


def clear_dependency_cache() -> None:
    get_session_store.cache_clear()
    get_auth_store.cache_clear()
    get_captcha_verifier.cache_clear()
    get_sms_auth_service.cache_clear()
