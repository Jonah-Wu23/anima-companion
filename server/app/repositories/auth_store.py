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

    IDENTITY_PHONE = "phone"
    IDENTITY_EMAIL = "email"
    _IDENTITY_TYPES = {IDENTITY_PHONE, IDENTITY_EMAIL}

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
                  email TEXT,
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
            self._ensure_auth_users_email_column(conn)
            self._ensure_auth_users_email_index(conn)
            self._ensure_auth_identities_table(conn)
            self._backfill_identities_from_auth_users(conn)

    @staticmethod
    def _ensure_auth_users_email_column(conn: sqlite3.Connection) -> None:
        columns = {
            str(row["name"]).lower()
            for row in conn.execute("PRAGMA table_info(auth_users)").fetchall()
        }
        if "email" not in columns:
            conn.execute("ALTER TABLE auth_users ADD COLUMN email TEXT")

    @staticmethod
    def _ensure_auth_users_email_index(conn: sqlite3.Connection) -> None:
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_users_email ON auth_users(email)"
        )

    @staticmethod
    def _ensure_auth_identities_table(conn: sqlite3.Connection) -> None:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS auth_identities (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id INTEGER NOT NULL,
              identity_type TEXT NOT NULL,
              identity_value TEXT NOT NULL,
              is_verified INTEGER NOT NULL DEFAULT 1,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL,
              FOREIGN KEY(user_id) REFERENCES auth_users(id)
            );

            CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_identities_type_value
              ON auth_identities(identity_type, identity_value);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_identities_user_type
              ON auth_identities(user_id, identity_type);
            CREATE INDEX IF NOT EXISTS idx_auth_identities_user
              ON auth_identities(user_id);
            """
        )

    def _backfill_identities_from_auth_users(self, conn: sqlite3.Connection) -> None:
        rows = conn.execute(
            "SELECT id, account, email FROM auth_users"
        ).fetchall()
        for row in rows:
            user_id = int(row["id"])
            account = self.normalize_account(str(row["account"]))
            if self._looks_like_phone(account):
                self._ensure_identity_in_conn(
                    conn=conn,
                    user_id=user_id,
                    identity_type=self.IDENTITY_PHONE,
                    identity_value=account,
                    is_verified=True,
                )
            email_raw = row["email"]
            if email_raw is not None and str(email_raw).strip():
                normalized_email = self.normalize_email(str(email_raw))
                self._ensure_identity_in_conn(
                    conn=conn,
                    user_id=user_id,
                    identity_type=self.IDENTITY_EMAIL,
                    identity_value=normalized_email,
                    is_verified=True,
                )

    @staticmethod
    def normalize_account(account: str) -> str:
        return account.strip().lower()

    @staticmethod
    def normalize_email(email: str) -> str:
        return email.strip().lower()

    @staticmethod
    def normalize_phone(phone: str) -> str:
        return "".join(ch for ch in phone if ch.isdigit())

    @staticmethod
    def _looks_like_phone(value: str) -> bool:
        return value.isdigit() and len(value) >= 11

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
                if self._looks_like_phone(normalized):
                    self._bind_identity_in_conn(
                        conn=conn,
                        user_id=user_id,
                        identity_type=self.IDENTITY_PHONE,
                        identity_value=normalized,
                        is_verified=True,
                    )
        except sqlite3.IntegrityError as exc:
            raise ValueError("account_exists") from exc
        except ValueError as exc:
            # Preserve original API semantics: phone conflicts surface as account conflict.
            if str(exc) in {"identity_exists", "phone_already_bound"}:
                raise ValueError("account_exists") from exc
            raise
        return AuthUser(id=user_id, account=normalized, created_at=now)

    def register_user_with_email(self, email: str, password: str) -> AuthUser:
        normalized_email = self.normalize_email(email)
        if not normalized_email:
            raise ValueError("invalid_email")
        now = int(time.time())
        password_hash = self._hash_password(password)
        for _ in range(5):
            generated_account = self._generate_email_account()
            try:
                with self._connect() as conn:
                    cursor = conn.execute(
                        """
                        INSERT INTO auth_users(account, email, password_hash, created_at)
                        VALUES(?, ?, ?, ?)
                        """,
                        (generated_account, normalized_email, password_hash, now),
                    )
                    user_id = int(cursor.lastrowid)
                    self._bind_identity_in_conn(
                        conn=conn,
                        user_id=user_id,
                        identity_type=self.IDENTITY_EMAIL,
                        identity_value=normalized_email,
                        is_verified=True,
                    )
                return AuthUser(id=user_id, account=generated_account, created_at=now)
            except sqlite3.IntegrityError as exc:
                error_text = str(exc).lower()
                if "auth_users.email" in error_text:
                    raise ValueError("email_exists") from exc
                if "auth_users.account" in error_text:
                    continue
                raise ValueError("register_failed") from exc
            except ValueError as exc:
                if str(exc) in {"identity_exists", "email_already_bound"}:
                    raise ValueError("email_exists") from exc
                raise
        raise ValueError("register_failed")

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

    def authenticate_user_by_email(self, email: str, password: str) -> AuthUser | None:
        normalized_email = self.normalize_email(email)
        row = self._find_user_row_by_identity(self.IDENTITY_EMAIL, normalized_email)
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

    def get_user_by_email(self, email: str) -> AuthUser | None:
        normalized_email = self.normalize_email(email)
        row = self._find_user_row_by_identity(self.IDENTITY_EMAIL, normalized_email)
        if row is None:
            return None
        return AuthUser(
            id=int(row["id"]),
            account=str(row["account"]),
            created_at=int(row["created_at"]),
        )

    def get_user_by_phone(self, phone: str) -> AuthUser | None:
        normalized_phone = self.normalize_phone(phone)
        row = self._find_user_row_by_identity(self.IDENTITY_PHONE, normalized_phone)
        if row is None:
            return None
        return AuthUser(
            id=int(row["id"]),
            account=str(row["account"]),
            created_at=int(row["created_at"]),
        )

    def bind_email_to_user(self, *, user_id: int, email: str, is_verified: bool = True) -> bool:
        normalized_email = self.normalize_email(email)
        if not normalized_email:
            raise ValueError("invalid_email")
        with self._connect() as conn:
            return self._bind_identity_in_conn(
                conn=conn,
                user_id=user_id,
                identity_type=self.IDENTITY_EMAIL,
                identity_value=normalized_email,
                is_verified=is_verified,
            )

    def bind_phone_to_user(self, *, user_id: int, phone: str, is_verified: bool = True) -> bool:
        normalized_phone = self.normalize_phone(phone)
        if not self._looks_like_phone(normalized_phone):
            raise ValueError("invalid_phone")
        with self._connect() as conn:
            return self._bind_identity_in_conn(
                conn=conn,
                user_id=user_id,
                identity_type=self.IDENTITY_PHONE,
                identity_value=normalized_phone,
                is_verified=is_verified,
            )

    def get_user_identities(self, user_id: int) -> dict[str, dict[str, object]]:
        result: dict[str, dict[str, object]] = {
            self.IDENTITY_PHONE: {"value": None, "is_verified": False},
            self.IDENTITY_EMAIL: {"value": None, "is_verified": False},
        }
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT identity_type, identity_value, is_verified
                FROM auth_identities
                WHERE user_id = ?
                """,
                (user_id,),
            ).fetchall()
        for row in rows:
            identity_type = str(row["identity_type"])
            if identity_type not in result:
                continue
            result[identity_type] = {
                "value": str(row["identity_value"]),
                "is_verified": bool(int(row["is_verified"])),
            }
        return result

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

    def _find_user_row_by_identity(self, identity_type: str, identity_value: str) -> sqlite3.Row | None:
        self._assert_identity_type(identity_type)
        with self._connect() as conn:
            return conn.execute(
                """
                SELECT u.id, u.account, u.password_hash, u.created_at
                FROM auth_identities i
                JOIN auth_users u ON u.id = i.user_id
                WHERE i.identity_type = ? AND i.identity_value = ?
                LIMIT 1
                """,
                (identity_type, identity_value),
            ).fetchone()

    def _bind_identity_in_conn(
        self,
        *,
        conn: sqlite3.Connection,
        user_id: int,
        identity_type: str,
        identity_value: str,
        is_verified: bool,
    ) -> bool:
        self._assert_identity_type(identity_type)
        normalized_value = self._normalize_identity_value(identity_type, identity_value)
        now = int(time.time())

        owner_row = conn.execute(
            """
            SELECT user_id, is_verified
            FROM auth_identities
            WHERE identity_type = ? AND identity_value = ?
            LIMIT 1
            """,
            (identity_type, normalized_value),
        ).fetchone()
        if owner_row is not None:
            owner_id = int(owner_row["user_id"])
            if owner_id != user_id:
                raise ValueError("identity_exists")
            if is_verified and int(owner_row["is_verified"]) == 0:
                conn.execute(
                    """
                    UPDATE auth_identities
                    SET is_verified = 1, updated_at = ?
                    WHERE user_id = ? AND identity_type = ? AND identity_value = ?
                    """,
                    (now, user_id, identity_type, normalized_value),
                )
            return False

        existing_type_row = conn.execute(
            """
            SELECT identity_value
            FROM auth_identities
            WHERE user_id = ? AND identity_type = ?
            LIMIT 1
            """,
            (user_id, identity_type),
        ).fetchone()
        if existing_type_row is not None:
            existing_value = str(existing_type_row["identity_value"])
            if existing_value == normalized_value:
                return False
            if identity_type == self.IDENTITY_PHONE:
                raise ValueError("phone_already_bound")
            raise ValueError("email_already_bound")

        try:
            conn.execute(
                """
                INSERT INTO auth_identities(
                  user_id, identity_type, identity_value, is_verified, created_at, updated_at
                ) VALUES(?, ?, ?, ?, ?, ?)
                """,
                (user_id, identity_type, normalized_value, 1 if is_verified else 0, now, now),
            )
            if identity_type == self.IDENTITY_EMAIL:
                conn.execute("UPDATE auth_users SET email = ? WHERE id = ?", (normalized_value, user_id))
            return True
        except sqlite3.IntegrityError as exc:
            resolved = self._resolve_identity_conflict_in_conn(
                conn=conn,
                user_id=user_id,
                identity_type=identity_type,
                normalized_value=normalized_value,
                exc=exc,
            )
            if resolved is not None:
                return resolved
            raise ValueError("identity_exists") from exc

    def _resolve_identity_conflict_in_conn(
        self,
        *,
        conn: sqlite3.Connection,
        user_id: int,
        identity_type: str,
        normalized_value: str,
        exc: sqlite3.IntegrityError,
    ) -> bool | None:
        owner_row = conn.execute(
            """
            SELECT user_id
            FROM auth_identities
            WHERE identity_type = ? AND identity_value = ?
            LIMIT 1
            """,
            (identity_type, normalized_value),
        ).fetchone()
        if owner_row is not None:
            owner_id = int(owner_row["user_id"])
            if owner_id != user_id:
                raise ValueError("identity_exists") from exc
            if identity_type == self.IDENTITY_EMAIL:
                conn.execute("UPDATE auth_users SET email = ? WHERE id = ?", (normalized_value, user_id))
            return False

        existing_type_row = conn.execute(
            """
            SELECT identity_value
            FROM auth_identities
            WHERE user_id = ? AND identity_type = ?
            LIMIT 1
            """,
            (user_id, identity_type),
        ).fetchone()
        if existing_type_row is None:
            return None

        existing_value = str(existing_type_row["identity_value"])
        if existing_value == normalized_value:
            if identity_type == self.IDENTITY_EMAIL:
                conn.execute("UPDATE auth_users SET email = ? WHERE id = ?", (normalized_value, user_id))
            return False
        if identity_type == self.IDENTITY_PHONE:
            raise ValueError("phone_already_bound") from exc
        raise ValueError("email_already_bound") from exc

    def _ensure_identity_in_conn(
        self,
        *,
        conn: sqlite3.Connection,
        user_id: int,
        identity_type: str,
        identity_value: str,
        is_verified: bool,
    ) -> None:
        self._assert_identity_type(identity_type)
        normalized_value = self._normalize_identity_value(identity_type, identity_value)
        now = int(time.time())
        owner_row = conn.execute(
            """
            SELECT user_id, is_verified
            FROM auth_identities
            WHERE identity_type = ? AND identity_value = ?
            LIMIT 1
            """,
            (identity_type, normalized_value),
        ).fetchone()
        if owner_row is not None:
            if int(owner_row["user_id"]) == user_id and is_verified and int(owner_row["is_verified"]) == 0:
                conn.execute(
                    """
                    UPDATE auth_identities
                    SET is_verified = 1, updated_at = ?
                    WHERE user_id = ? AND identity_type = ? AND identity_value = ?
                    """,
                    (now, user_id, identity_type, normalized_value),
                )
            if identity_type == self.IDENTITY_EMAIL and int(owner_row["user_id"]) == user_id:
                conn.execute("UPDATE auth_users SET email = ? WHERE id = ?", (normalized_value, user_id))
            return

        existing_type_row = conn.execute(
            """
            SELECT identity_value
            FROM auth_identities
            WHERE user_id = ? AND identity_type = ?
            LIMIT 1
            """,
            (user_id, identity_type),
        ).fetchone()
        if existing_type_row is not None:
            if identity_type == self.IDENTITY_EMAIL:
                conn.execute(
                    "UPDATE auth_users SET email = ? WHERE id = ?",
                    (str(existing_type_row["identity_value"]), user_id),
                )
            return

        conn.execute(
            """
            INSERT INTO auth_identities(
              user_id, identity_type, identity_value, is_verified, created_at, updated_at
            ) VALUES(?, ?, ?, ?, ?, ?)
            """,
            (user_id, identity_type, normalized_value, 1 if is_verified else 0, now, now),
        )
        if identity_type == self.IDENTITY_EMAIL:
            conn.execute("UPDATE auth_users SET email = ? WHERE id = ?", (normalized_value, user_id))

    def _normalize_identity_value(self, identity_type: str, identity_value: str) -> str:
        self._assert_identity_type(identity_type)
        if identity_type == self.IDENTITY_PHONE:
            normalized = self.normalize_phone(identity_value)
            if not self._looks_like_phone(normalized):
                raise ValueError("invalid_phone")
            return normalized
        normalized = self.normalize_email(identity_value)
        if not normalized:
            raise ValueError("invalid_email")
        return normalized

    def _assert_identity_type(self, identity_type: str) -> None:
        if identity_type not in self._IDENTITY_TYPES:
            raise ValueError("invalid_identity_type")

    @staticmethod
    def _generate_email_account() -> str:
        return f"email_{secrets.token_hex(8)}"

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
