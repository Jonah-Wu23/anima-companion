"""阿里云验证码 2.0 服务端验签。"""

from __future__ import annotations

from dataclasses import dataclass


class CaptchaVerifyError(RuntimeError):
    """验证码验签失败。"""


@dataclass(frozen=True)
class CaptchaVerifyResult:
    passed: bool
    verify_code: str
    request_id: str
    raw_code: str
    raw_message: str


class CaptchaVerifier:
    def __init__(
        self,
        *,
        access_key_id: str,
        access_key_secret: str,
        region: str,
        scene_id_login: str,
        scene_id_register: str,
        scene_id_sms: str,
        dual_stack: bool = False,
    ) -> None:
        self._access_key_id = access_key_id.strip()
        self._access_key_secret = access_key_secret.strip()
        self._region = region.strip().lower() or "cn"
        self._scene_id_login = scene_id_login.strip()
        self._scene_id_register = scene_id_register.strip()
        self._scene_id_sms = scene_id_sms.strip()
        self._dual_stack = bool(dual_stack)

    def verify(self, *, captcha_verify_param: str, scene: str) -> CaptchaVerifyResult:
        if not captcha_verify_param.strip():
            raise CaptchaVerifyError("AUTH_CAPTCHA_REQUIRED")

        scene_id = self._resolve_scene_id(scene)
        client = self._create_client()
        request, runtime = self._build_request(captcha_verify_param=captcha_verify_param, scene_id=scene_id)
        try:
            response = client.verify_intelligent_captcha_with_options(request, runtime)
        except Exception as exc:  # noqa: BLE001
            raise CaptchaVerifyError("AUTH_CAPTCHA_REQUIRED") from exc

        body = getattr(response, "body", response)
        raw_code = self._read_value(body, "code")
        raw_message = self._read_value(body, "message")
        request_id = self._read_value(body, "request_id")

        result = getattr(body, "result", None)
        verify_result = bool(self._read_value(result, "verify_result"))
        verify_code = self._read_value(result, "verify_code")
        if raw_code.lower() != "success":
            raise CaptchaVerifyError("AUTH_CAPTCHA_REQUIRED")
        if not verify_result:
            raise CaptchaVerifyError("AUTH_CAPTCHA_REQUIRED")

        return CaptchaVerifyResult(
            passed=True,
            verify_code=verify_code,
            request_id=request_id,
            raw_code=raw_code,
            raw_message=raw_message,
        )

    def _resolve_scene_id(self, scene: str) -> str:
        normalized = scene.strip().lower()
        if normalized == "login":
            scene_id = self._scene_id_login
        elif normalized == "register":
            scene_id = self._scene_id_register
        elif normalized == "sms":
            scene_id = self._scene_id_sms
        else:
            scene_id = ""
        if not scene_id:
            raise CaptchaVerifyError("AUTH_CAPTCHA_REQUIRED")
        return scene_id

    def _resolve_endpoint(self) -> str:
        if self._region == "sgp":
            return "captcha-dualstack.ap-southeast-1.aliyuncs.com" if self._dual_stack else "captcha.ap-southeast-1.aliyuncs.com"
        return "captcha-dualstack.cn-shanghai.aliyuncs.com" if self._dual_stack else "captcha.cn-shanghai.aliyuncs.com"

    def _create_client(self):  # type: ignore[no-untyped-def]
        if not self._access_key_id or not self._access_key_secret:
            raise CaptchaVerifyError("AUTH_CAPTCHA_REQUIRED")
        try:
            from alibabacloud_captcha20230305.client import Client as CaptchaClient
            from alibabacloud_tea_openapi import models as open_api_models
        except Exception as exc:  # noqa: BLE001
            raise CaptchaVerifyError("AUTH_CAPTCHA_REQUIRED") from exc

        config = open_api_models.Config(
            access_key_id=self._access_key_id,
            access_key_secret=self._access_key_secret,
        )
        config.endpoint = self._resolve_endpoint()
        return CaptchaClient(config)

    def _build_request(self, *, captcha_verify_param: str, scene_id: str):  # type: ignore[no-untyped-def]
        try:
            from alibabacloud_captcha20230305 import models as captcha_models
            from alibabacloud_tea_util import models as util_models
        except Exception as exc:  # noqa: BLE001
            raise CaptchaVerifyError("AUTH_CAPTCHA_REQUIRED") from exc
        request = captcha_models.VerifyIntelligentCaptchaRequest(
            captcha_verify_param=captcha_verify_param,
            scene_id=scene_id,
        )
        runtime = util_models.RuntimeOptions()
        return request, runtime

    @staticmethod
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
