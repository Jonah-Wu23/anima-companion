"""认证接口。"""

from __future__ import annotations

import logging
import re
import time

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from app.core.settings import Settings, get_settings
from app.dependencies import get_auth_store, get_captcha_verifier, get_sms_auth_service
from app.repositories.auth_store import AuthStore, AuthUser, SmsChallenge
from app.schemas.auth import (
    AuthLoginPasswordRequest,
    AuthLoginSmsRequest,
    AuthLogoutResponse,
    AuthRegisterRequest,
    AuthSessionResponse,
    AuthSmsSendRequest,
    AuthSmsSendResponse,
    AuthUserResponse,
)
from app.services.auth.captcha_verifier import CaptchaVerifier, CaptchaVerifyError
from app.services.auth.sms_auth_service import SmsAuthError, SmsAuthService

router = APIRouter(prefix="/v1/auth", tags=["auth"])
logger = logging.getLogger(__name__)


def _to_user_response(user: AuthUser) -> AuthUserResponse:
    return AuthUserResponse(id=user.id, account=user.account, created_at=user.created_at)


def _set_auth_cookie(response: Response, token: str, settings: Settings) -> None:
    response.set_cookie(
        key=settings.auth_cookie_name,
        value=token,
        max_age=settings.auth_session_ttl_seconds,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite="lax",
        path="/",
    )


def _clear_auth_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        key=settings.auth_cookie_name,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite="lax",
        path="/",
    )


def _normalize_phone(phone: str) -> str:
    digits = re.sub(r"[^0-9]", "", phone or "")
    return digits


def _verify_captcha(
    *,
    captcha_verifier: CaptchaVerifier,
    captcha_verify_param: str,
    scene: str,
) -> None:
    try:
        captcha_verifier.verify(captcha_verify_param=captcha_verify_param, scene=scene)
    except CaptchaVerifyError as exc:
        raise HTTPException(status_code=400, detail="请先完成人机验证") from exc


def _assert_sms_challenge_ready(
    *,
    challenge: SmsChallenge | None,
    phone: str,
    scene: str,
) -> SmsChallenge:
    now = int(time.time())
    if challenge is None:
        logger.warning("sms challenge missing: phone=%s scene=%s", _mask_phone(phone), scene)
        raise HTTPException(status_code=401, detail="验证码错误或已过期，请重新获取")
    if challenge.used_at is not None:
        logger.warning(
            "sms challenge already used: challenge_id=%s phone=%s scene=%s",
            _mask_text(challenge.challenge_id),
            _mask_phone(phone),
            scene,
        )
        raise HTTPException(status_code=401, detail="验证码错误或已过期，请重新获取")
    if challenge.expires_at <= now:
        logger.warning(
            "sms challenge expired: challenge_id=%s phone=%s scene=%s expires_at=%s now=%s",
            _mask_text(challenge.challenge_id),
            _mask_phone(phone),
            scene,
            challenge.expires_at,
            now,
        )
        raise HTTPException(status_code=401, detail="验证码错误或已过期，请重新获取")
    if challenge.phone != phone or challenge.scene != scene:
        logger.warning(
            "sms challenge mismatch: challenge_id=%s phone=%s scene=%s stored_phone=%s stored_scene=%s",
            _mask_text(challenge.challenge_id),
            _mask_phone(phone),
            scene,
            _mask_phone(challenge.phone),
            challenge.scene,
        )
        raise HTTPException(status_code=401, detail="验证码错误或已过期，请重新获取")
    return challenge


def _verify_sms_code_or_raise(
    *,
    store: AuthStore,
    sms_service: SmsAuthService,
    challenge_id: str,
    phone: str,
    scene: str,
    sms_code: str,
) -> None:
    challenge = _assert_sms_challenge_ready(
        challenge=store.find_sms_challenge(challenge_id=challenge_id),
        phone=phone,
        scene=scene,
    )
    verified = sms_service.verify_code(
        phone=challenge.phone,
        out_id=challenge.challenge_id,
        verify_code=sms_code,
    )
    if not verified:
        logger.warning(
            "sms verify failed: challenge_id=%s phone=%s scene=%s",
            _mask_text(challenge.challenge_id),
            _mask_phone(phone),
            scene,
        )
        raise HTTPException(status_code=401, detail="验证码错误或已过期，请重新获取")
    store.consume_sms_challenge(challenge_id=challenge.challenge_id)


@router.post("/sms/send", response_model=AuthSmsSendResponse)
def send_sms(
    req: AuthSmsSendRequest,
    store: AuthStore = Depends(get_auth_store),
    captcha_verifier: CaptchaVerifier = Depends(get_captcha_verifier),
    sms_service: SmsAuthService = Depends(get_sms_auth_service),
    settings: Settings = Depends(get_settings),
) -> AuthSmsSendResponse:
    normalized_phone = _normalize_phone(req.phone)
    if len(normalized_phone) < 11:
        raise HTTPException(status_code=400, detail="手机号格式不正确")

    _verify_captcha(
        captcha_verifier=captcha_verifier,
        captcha_verify_param=req.captcha_verify_param,
        scene="sms",
    )

    challenge = store.create_sms_challenge(
        phone=normalized_phone,
        scene=req.scene,
        ttl_seconds=settings.auth_sms_challenge_ttl_seconds,
    )
    try:
        send_result = sms_service.send_code(phone=normalized_phone, out_id=challenge.challenge_id)
    except SmsAuthError as exc:
        raise HTTPException(status_code=502, detail="验证码发送失败，请稍后重试") from exc
    if send_result.provider_biz_id:
        store.update_sms_challenge_provider_biz_id(
            challenge_id=challenge.challenge_id,
            provider_biz_id=send_result.provider_biz_id,
        )
    return AuthSmsSendResponse(
        sms_challenge_id=challenge.challenge_id,
        retry_after_sec=send_result.retry_after_sec,
    )


@router.post("/register", response_model=AuthSessionResponse)
def register(
    req: AuthRegisterRequest,
    response: Response,
    store: AuthStore = Depends(get_auth_store),
    captcha_verifier: CaptchaVerifier = Depends(get_captcha_verifier),
    sms_service: SmsAuthService = Depends(get_sms_auth_service),
    settings: Settings = Depends(get_settings),
) -> AuthSessionResponse:
    normalized_phone = _normalize_phone(req.phone)
    if len(normalized_phone) < 11:
        raise HTTPException(status_code=400, detail="手机号格式不正确")
    _verify_captcha(
        captcha_verifier=captcha_verifier,
        captcha_verify_param=req.captcha_verify_param,
        scene="register",
    )
    _verify_sms_code_or_raise(
        store=store,
        sms_service=sms_service,
        challenge_id=req.sms_challenge_id,
        phone=normalized_phone,
        scene="register",
        sms_code=req.sms_code,
    )

    try:
        user = store.register_user(account=normalized_phone, password=req.password)
    except ValueError as exc:
        if str(exc) == "account_exists":
            raise HTTPException(status_code=409, detail="账号已存在") from exc
        raise HTTPException(status_code=400, detail="注册失败") from exc

    session = store.create_session(user.id)
    _set_auth_cookie(response, session.token, settings)
    return AuthSessionResponse(user=_to_user_response(user), expires_at=session.expires_at)


@router.post("/login/password", response_model=AuthSessionResponse)
def login_password(
    req: AuthLoginPasswordRequest,
    response: Response,
    store: AuthStore = Depends(get_auth_store),
    captcha_verifier: CaptchaVerifier = Depends(get_captcha_verifier),
    settings: Settings = Depends(get_settings),
) -> AuthSessionResponse:
    _verify_captcha(
        captcha_verifier=captcha_verifier,
        captcha_verify_param=req.captcha_verify_param,
        scene="login",
    )
    account = req.account
    normalized_phone = _normalize_phone(account)
    if len(normalized_phone) >= 11:
        account = normalized_phone
    user = store.authenticate_user(account=account, password=req.password)
    if user is None:
        raise HTTPException(status_code=401, detail="账号或密码错误")

    session = store.create_session(user.id)
    _set_auth_cookie(response, session.token, settings)
    return AuthSessionResponse(user=_to_user_response(user), expires_at=session.expires_at)


@router.post("/login/sms", response_model=AuthSessionResponse)
def login_sms(
    req: AuthLoginSmsRequest,
    response: Response,
    store: AuthStore = Depends(get_auth_store),
    captcha_verifier: CaptchaVerifier = Depends(get_captcha_verifier),
    sms_service: SmsAuthService = Depends(get_sms_auth_service),
    settings: Settings = Depends(get_settings),
) -> AuthSessionResponse:
    normalized_phone = _normalize_phone(req.phone)
    if len(normalized_phone) < 11:
        raise HTTPException(status_code=400, detail="手机号格式不正确")
    _verify_captcha(
        captcha_verifier=captcha_verifier,
        captcha_verify_param=req.captcha_verify_param,
        scene="login",
    )
    _verify_sms_code_or_raise(
        store=store,
        sms_service=sms_service,
        challenge_id=req.sms_challenge_id,
        phone=normalized_phone,
        scene="login",
        sms_code=req.sms_code,
    )

    user = store.get_user_by_account(normalized_phone)
    if user is None:
        raise HTTPException(status_code=401, detail="账号或验证码错误")
    session = store.create_session(user.id)
    _set_auth_cookie(response, session.token, settings)
    return AuthSessionResponse(user=_to_user_response(user), expires_at=session.expires_at)


@router.post("/logout", response_model=AuthLogoutResponse)
def logout(
    request: Request,
    response: Response,
    store: AuthStore = Depends(get_auth_store),
    settings: Settings = Depends(get_settings),
) -> AuthLogoutResponse:
    session_token = request.cookies.get(settings.auth_cookie_name, "")
    if session_token:
        store.revoke_session(session_token)
    _clear_auth_cookie(response, settings)
    return AuthLogoutResponse(ok=True)


@router.get("/me", response_model=AuthSessionResponse)
def me(
    request: Request,
    store: AuthStore = Depends(get_auth_store),
    settings: Settings = Depends(get_settings),
) -> AuthSessionResponse:
    session_token = request.cookies.get(settings.auth_cookie_name, "")
    if not session_token:
        raise HTTPException(status_code=401, detail="未登录")

    resolved = store.get_user_by_session(session_token)
    if resolved is None:
        raise HTTPException(status_code=401, detail="未登录")

    user, expires_at = resolved
    return AuthSessionResponse(user=_to_user_response(user), expires_at=expires_at)


def _mask_phone(phone: str) -> str:
    digits = "".join(ch for ch in phone if ch.isdigit())
    if len(digits) < 7:
        return "***"
    return f"{digits[:3]}****{digits[-4:]}"


def _mask_text(text: str) -> str:
    cleaned = (text or "").strip()
    if len(cleaned) <= 8:
        return "***"
    return f"{cleaned[:4]}...{cleaned[-4:]}"
