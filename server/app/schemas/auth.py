"""认证协议。"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

AuthSmsScene = Literal["register", "login", "reset_password"]


class AuthSmsSendRequest(BaseModel):
    phone: str = Field(..., min_length=6, max_length=20)
    scene: AuthSmsScene
    captcha_verify_param: str = Field(..., min_length=8)


class AuthSmsSendResponse(BaseModel):
    sms_challenge_id: str
    retry_after_sec: int


class AuthRegisterRequest(BaseModel):
    phone: str = Field(..., min_length=6, max_length=20)
    sms_challenge_id: str = Field(..., min_length=8, max_length=128)
    sms_code: str = Field(..., min_length=4, max_length=8)
    password: str = Field(..., min_length=6, max_length=128)
    captcha_verify_param: str = Field(..., min_length=8)


class AuthLoginPasswordRequest(BaseModel):
    account: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=6, max_length=128)
    captcha_verify_param: str = Field(..., min_length=8)


class AuthRegisterEmailRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=128)
    captcha_verify_param: str = Field(..., min_length=8)

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        normalized = value.strip().lower()
        if len(normalized) > 254:
            raise ValueError("邮箱长度不能超过254字符")
        return normalized


class AuthLoginEmailRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=128)
    captcha_verify_param: str = Field(..., min_length=8)

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        normalized = value.strip().lower()
        if len(normalized) > 254:
            raise ValueError("邮箱长度不能超过254字符")
        return normalized


class AuthLoginSmsRequest(BaseModel):
    phone: str = Field(..., min_length=6, max_length=20)
    sms_challenge_id: str = Field(..., min_length=8, max_length=128)
    sms_code: str = Field(..., min_length=4, max_length=8)
    captcha_verify_param: str = Field(..., min_length=8)


class AuthBindPhoneRequest(BaseModel):
    phone: str = Field(..., min_length=6, max_length=20)
    sms_challenge_id: str = Field(..., min_length=8, max_length=128)
    sms_code: str = Field(..., min_length=4, max_length=8)
    captcha_verify_param: str = Field(..., min_length=8)


class AuthBindEmailRequest(BaseModel):
    email: EmailStr
    captcha_verify_param: str = Field(..., min_length=8)

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        normalized = value.strip().lower()
        if len(normalized) > 254:
            raise ValueError("邮箱长度不能超过254字符")
        return normalized


class AuthUserResponse(BaseModel):
    id: int
    account: str
    created_at: int


class AuthIdentityBindingResponse(BaseModel):
    value: str | None = None
    is_verified: bool = False


class AuthIdentitiesMeResponse(BaseModel):
    phone: AuthIdentityBindingResponse
    email: AuthIdentityBindingResponse


class AuthSessionResponse(BaseModel):
    user: AuthUserResponse
    expires_at: int


class AuthLogoutResponse(BaseModel):
    ok: bool = True
