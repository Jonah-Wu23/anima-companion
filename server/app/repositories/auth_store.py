"""账号与会话 SQLite 存储。"""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import sqlite3
import time
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class AuthUser:
    id: int
    account: str
    created_at: int


@dataclass(frozen=True)
class AuthSession:
    token: str
    expires_at: int


@dataclass(frozen=True)
class SmsChallenge:
    challenge_id: str
    phone: str
    scene: str
    created_at: int
    expires_at: int
    used_at: int | None


class AuthStore:
    """最小认证存储：账号+密码+会话。"""

    def __init__(self, db_path: Path, session_secret: str, session_ttl_seconds: int) -> None:
        self._db_path = db_path
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._session_secret = session_secret
        self._session_ttl_seconds = max(300, int(session_ttl_seconds))
        self._init_tables()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_tables(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS auth_users (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  account TEXT NOT NULL UNIQUE,
                  password_hash TEXT NOT NULL,
                  created_at INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS auth_sessions (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  user_id INTEGER NOT NULL,
                  token_hash TEXT NOT NULL UNIQUE,
                  created_at INTEGER NOT NULL,
                  expires_at INTEGER NOT NULL,
                  revoked_at INTEGER,
                  FOREIGN KEY(user_id) REFERENCES auth_users(id)
                );

                CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
                CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON auth_sessions(expires_at);

                CREATE TABLE IF NOT EXISTS auth_sms_challenges (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  challenge_id TEXT NOT NULL UNIQUE,
                  phone TEXT NOT NULL,
                  scene TEXT NOT NULL,
                  provider_biz_id TEXT,
                  created_at INTEGER NOT NULL,
                  expires_at INTEGER NOT NULL,
                  used_at INTEGER
                );

                CREATE INDEX IF NOT EXISTS idx_auth_sms_phone_scene ON auth_sms_challenges(phone, scene, created_at);
                CREATE INDEX IF NOT EXISTS idx_auth_sms_expires ON auth_sms_challenges(expires_at);
                """
            )

    @staticmethod
    def normalize_account(account: str) -> str:
        return account.strip().lower()

    def register_user(self, account: str, password: str) -> AuthUser:
        normalized = self.normalize_account(account)
        now = int(time.time())
        password_hash = self._hash_password(password)
        try:
            with self._connect() as conn:
                cursor = conn.execute(
                    "INSERT INTO auth_users(account, password_hash, created_at) VALUES(?, ?, ?)",
                    (normalized, password_hash, now),
                )
                user_id = int(cursor.lastrowid)
        except sqlite3.IntegrityError as exc:
            raise ValueError("account_exists") from exc
        return AuthUser(id=user_id, account=normalized, created_at=now)

    def authenticate_user(self, account: str, password: str) -> AuthUser | None:
        normalized = self.normalize_account(account)
        row = self._find_user_row_by_account(normalized)
        if row is None:
            return None
        if not self._verify_password(password, str(row["password_hash"])):
            return None
        return AuthUser(
            id=int(row["id"]),
            account=str(row["account"]),
            created_at=int(row["created_at"]),
        )

    def get_user_by_account(self, account: str) -> AuthUser | None:
        normalized = self.normalize_account(account)
        row = self._find_user_row_by_account(normalized)
        if row is None:
            return None
        return AuthUser(
            id=int(row["id"]),
            account=str(row["account"]),
            created_at=int(row["created_at"]),
        )

    def create_sms_challenge(
        self,
        *,
        phone: str,
        scene: str,
        ttl_seconds: int,
        provider_biz_id: str = "",
    ) -> SmsChallenge:
        # Keep OutId strictly alphanumeric to avoid provider-side validation errors.
        challenge_id = secrets.token_hex(16)
        now = int(time.time())
        expires_at = now + max(60, int(ttl_seconds))
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO auth_sms_challenges(
                  challenge_id, phone, scene, provider_biz_id, created_at, expires_at, used_at
                ) VALUES(?, ?, ?, ?, ?, ?, NULL)
                """,
                (challenge_id, phone, scene, provider_biz_id, now, expires_at),
            )
        return SmsChallenge(
            challenge_id=challenge_id,
            phone=phone,
            scene=scene,
            created_at=now,
            expires_at=expires_at,
            used_at=None,
        )

    def update_sms_challenge_provider_biz_id(self, *, challenge_id: str, provider_biz_id: str) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE auth_sms_challenges
                SET provider_biz_id = ?
                WHERE challenge_id = ?
                """,
                (provider_biz_id, challenge_id),
            )

    def find_sms_challenge(self, *, challenge_id: str) -> SmsChallenge | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT challenge_id, phone, scene, created_at, expires_at, used_at
                FROM auth_sms_challenges
                WHERE challenge_id = ?
                LIMIT 1
                """,
                (challenge_id,),
            ).fetchone()
        if row is None:
            return None
        return SmsChallenge(
            challenge_id=str(row["challenge_id"]),
            phone=str(row["phone"]),
            scene=str(row["scene"]),
            created_at=int(row["created_at"]),
            expires_at=int(row["expires_at"]),
            used_at=int(row["used_at"]) if row["used_at"] is not None else None,
        )

    def consume_sms_challenge(self, *, challenge_id: str) -> None:
        now = int(time.time())
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE auth_sms_challenges
                SET used_at = ?
                WHERE challenge_id = ? AND used_at IS NULL
                """,
                (now, challenge_id),
            )

    def _find_user_row_by_account(self, normalized_account: str) -> sqlite3.Row | None:
        with self._connect() as conn:
            return conn.execute(
                "SELECT id, account, password_hash, created_at FROM auth_users WHERE account = ?",
                (normalized_account,),
            ).fetchone()

    def create_session(self, user_id: int) -> AuthSession:
        token = secrets.token_urlsafe(32)
        token_hash = self._hash_session_token(token)
        now = int(time.time())
        expires_at = now + self._session_ttl_seconds
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO auth_sessions(user_id, token_hash, created_at, expires_at, revoked_at)
                VALUES(?, ?, ?, ?, NULL)
                """,
                (user_id, token_hash, now, expires_at),
            )
        return AuthSession(token=token, expires_at=expires_at)

    def revoke_session(self, token: str) -> None:
        token_hash = self._hash_session_token(token)
        now = int(time.time())
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE auth_sessions
                SET revoked_at = ?
                WHERE token_hash = ? AND revoked_at IS NULL
                """,
                (now, token_hash),
            )

    def get_user_by_session(self, token: str) -> tuple[AuthUser, int] | None:
        token_hash = self._hash_session_token(token)
        now = int(time.time())
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT
                  u.id AS user_id,
                  u.account AS account,
                  u.created_at AS user_created_at,
                  s.expires_at AS expires_at
                FROM auth_sessions s
                JOIN auth_users u ON u.id = s.user_id
                WHERE s.token_hash = ?
                  AND s.revoked_at IS NULL
                  AND s.expires_at > ?
                LIMIT 1
                """,
                (token_hash, now),
            ).fetchone()
        if row is None:
            return None
        user = AuthUser(
            id=int(row["user_id"]),
            account=str(row["account"]),
            created_at=int(row["user_created_at"]),
        )
        return user, int(row["expires_at"])

    def _hash_session_token(self, token: str) -> str:
        payload = f"{self._session_secret}:{token}".encode("utf-8")
        return hashlib.sha256(payload).hexdigest()

    @staticmethod
    def _hash_password(password: str) -> str:
        iterations = 310000
        salt = secrets.token_bytes(16)
        derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
        salt_b64 = base64.b64encode(salt).decode("ascii")
        hash_b64 = base64.b64encode(derived).decode("ascii")
        return f"pbkdf2_sha256${iterations}${salt_b64}${hash_b64}"

    @staticmethod
    def _verify_password(password: str, encoded: str) -> bool:
        try:
            algo, iter_text, salt_b64, hash_b64 = encoded.split("$", 3)
            if algo != "pbkdf2_sha256":
                return False
            iterations = int(iter_text)
            salt = base64.b64decode(salt_b64.encode("ascii"))
            expected = base64.b64decode(hash_b64.encode("ascii"))
        except (ValueError, TypeError):
            return False
        calculated = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
        return hmac.compare_digest(calculated, expected)
