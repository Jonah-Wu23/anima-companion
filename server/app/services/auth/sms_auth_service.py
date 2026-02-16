"""阿里云短信认证服务封装。"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass


class SmsAuthError(RuntimeError):
    """短信服务调用失败。"""


@dataclass(frozen=True)
class SmsSendResult:
    provider_biz_id: str
    retry_after_sec: int


logger = logging.getLogger(__name__)


class SmsAuthService:
    def __init__(
        self,
        *,
        access_key_id: str,
        access_key_secret: str,
        sign_name: str,
        template_code: str,
        template_param: str,
        scheme_name: str,
        country_code: str,
        interval_seconds: int,
        valid_minutes: int,
    ) -> None:
        self._access_key_id = access_key_id.strip()
        self._access_key_secret = access_key_secret.strip()
        self._sign_name = sign_name.strip()
        self._template_code = template_code.strip()
        self._template_param = template_param.strip()
        self._scheme_name = scheme_name.strip()
        self._country_code = country_code.strip().lower() or "86"
        self._interval_seconds = max(1, int(interval_seconds))
        self._valid_minutes = max(1, int(valid_minutes))
        self._dynamic_code_mode, self._fixed_verify_code = _resolve_verify_code_mode(self._template_param)

    def send_code(self, *, phone: str, out_id: str) -> SmsSendResult:
        if not phone.strip() or not out_id.strip():
            raise SmsAuthError("AUTH_SMS_INVALID")
        client = self._create_client()
        request, runtime = self._build_send_request(phone=phone, out_id=out_id)
        try:
            response = client.send_sms_verify_code_with_options(request, runtime)
        except Exception as exc:  # noqa: BLE001
            raise SmsAuthError("AUTH_SMS_INVALID") from exc
        body = getattr(response, "body", response)
        code = _read_value(body, "code").upper()
        if code not in {"OK", "SUCCESS"}:
            logger.warning(
                "sms send failed: code=%s message=%s phone=%s out_id=%s",
                code,
                _read_value(body, "message"),
                _mask_phone(phone),
                _mask_text(out_id),
            )
            raise SmsAuthError("AUTH_SMS_INVALID")
        model = getattr(body, "model", None)
        provider_biz_id = _read_value(model, "biz_id") or _read_value(body, "biz_id")
        return SmsSendResult(provider_biz_id=provider_biz_id, retry_after_sec=self._interval_seconds)

    def verify_code(self, *, phone: str, out_id: str, verify_code: str) -> bool:
        normalized_code = _normalize_sms_code(verify_code)
        if not phone.strip() or not normalized_code:
            return False
        if not self._dynamic_code_mode:
            expected = _normalize_sms_code(self._fixed_verify_code)
            passed = bool(expected) and normalized_code == expected
            if not passed:
                logger.warning(
                    "sms check fixed-code mismatch: phone=%s out_id=%s code_len=%s",
                    _mask_phone(phone),
                    _mask_text(out_id),
                    len(normalized_code),
                )
            return passed
        client = self._create_client()
        request, runtime = self._build_check_request(phone=phone, verify_code=normalized_code)
        try:
            response = client.check_sms_verify_code_with_options(request, runtime)
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "sms check exception: phone=%s out_id=%s code_len=%s error=%s",
                _mask_phone(phone),
                _mask_text(out_id),
                len(normalized_code),
                str(exc),
            )
            return False
        body = getattr(response, "body", response)
        return self._parse_check_response(body=body, phone=phone, out_id=out_id)

    def _parse_check_response(self, *, body: object, phone: str, out_id: str) -> bool:
        code = _read_value(body, "code").upper()
        if code not in {"OK", "SUCCESS"}:
            logger.warning(
                "sms check failed: code=%s message=%s phone=%s out_id=%s",
                code,
                _read_value(body, "message"),
                _mask_phone(phone),
                _mask_text(out_id),
            )
            return False

        model = getattr(body, "model", None)
        verify_result = _read_value(model, "verify_result") or _read_value(body, "verify_result")
        if verify_result:
            normalized = verify_result.strip().upper()
            passed = normalized in {"PASS", "TRUE", "SUCCESS"}
            if not passed:
                logger.warning(
                    "sms check verify_result=false: phone=%s out_id=%s",
                    _mask_phone(phone),
                    _mask_text(out_id),
                )
            return passed

        is_code_valid = _read_value(model, "is_code_valid") or _read_value(body, "is_code_valid")
        if is_code_valid:
            passed = is_code_valid.lower() == "true"
            if not passed:
                logger.warning(
                    "sms check is_code_valid=false: phone=%s out_id=%s",
                    _mask_phone(phone),
                    _mask_text(out_id),
                )
            return passed
        logger.warning(
            "sms check missing verify result fields: phone=%s out_id=%s",
            _mask_phone(phone),
            _mask_text(out_id),
        )
        return False

    def _create_client(self):  # type: ignore[no-untyped-def]
        if not self._access_key_id or not self._access_key_secret:
            raise SmsAuthError("AUTH_SMS_INVALID")
        if not self._sign_name or not self._template_code or not self._template_param:
            raise SmsAuthError("AUTH_SMS_INVALID")
        try:
            from alibabacloud_dypnsapi20170525.client import Client as DypnsapiClient
            from alibabacloud_tea_openapi import models as open_api_models
        except Exception as exc:  # noqa: BLE001
            raise SmsAuthError("AUTH_SMS_INVALID") from exc
        config = open_api_models.Config(
            access_key_id=self._access_key_id,
            access_key_secret=self._access_key_secret,
        )
        config.endpoint = "dypnsapi.aliyuncs.com"
        return DypnsapiClient(config)

    def _build_send_request(self, *, phone: str, out_id: str):  # type: ignore[no-untyped-def]
        try:
            from alibabacloud_dypnsapi20170525 import models as dypns_models
            from alibabacloud_tea_util import models as util_models
        except Exception as exc:  # noqa: BLE001
            raise SmsAuthError("AUTH_SMS_INVALID") from exc
        request = dypns_models.SendSmsVerifyCodeRequest(
            phone_number=phone,
            sign_name=self._sign_name,
            template_code=self._template_code,
            template_param=self._template_param,
        )
        runtime = util_models.RuntimeOptions()
        return request, runtime

    def _build_check_request(
        self,
        *,
        phone: str,
        verify_code: str,
    ):  # type: ignore[no-untyped-def]
        try:
            from alibabacloud_dypnsapi20170525 import models as dypns_models
            from alibabacloud_tea_util import models as util_models
        except Exception as exc:  # noqa: BLE001
            raise SmsAuthError("AUTH_SMS_INVALID") from exc
        request = dypns_models.CheckSmsVerifyCodeRequest(
            phone_number=phone,
            verify_code=verify_code,
        )
        runtime = util_models.RuntimeOptions()
        return request, runtime


def _read_value(source: object, field: str) -> str:
    if source is None:
        return ""
    for key in (field, _to_camel(field)):
        if hasattr(source, key):
            value = getattr(source, key)
            return str(value) if value is not None else ""
        if isinstance(source, dict) and key in source:
            value = source.get(key)
            return str(value) if value is not None else ""
    return ""


def _to_camel(field: str) -> str:
    parts = field.split("_")
    if not parts:
        return field
    return parts[0] + "".join(p[:1].upper() + p[1:] for p in parts[1:])


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


def _normalize_sms_code(text: str) -> str:
    raw = (text or "").strip()
    digits = "".join(ch for ch in raw if ch.isdigit())
    return digits if digits else raw


def _resolve_verify_code_mode(template_param: str) -> tuple[bool, str]:
    try:
        payload = json.loads(template_param)
    except (TypeError, ValueError, json.JSONDecodeError):
        return True, ""
    if not isinstance(payload, dict):
        return True, ""
    code = str(payload.get("code", "")).strip()
    if not code:
        return True, ""
    if code == "##code##":
        return True, ""
    return False, code
