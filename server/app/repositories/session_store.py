"""会话数据 SQLite 存储。"""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any, Callable, TypeVar

T = TypeVar("T")


class SessionStore:
    """P0 会话持久化存储。"""

    def __init__(self, db_path: Path) -> None:
        self._db_path = db_path
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_tables()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_tables(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS messages (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  session_id TEXT NOT NULL,
                  role TEXT NOT NULL,
                  content TEXT NOT NULL,
                  ts DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS memories (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  session_id TEXT NOT NULL,
                  key TEXT NOT NULL,
                  value TEXT NOT NULL,
                  type TEXT NOT NULL,
                  ts DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS relationship (
                  session_id TEXT PRIMARY KEY,
                  trust INTEGER NOT NULL DEFAULT 0,
                  reliance INTEGER NOT NULL DEFAULT 0,
                  fatigue INTEGER NOT NULL DEFAULT 0,
                  ts DATETIME DEFAULT CURRENT_TIMESTAMP
                );
                """
            )

    @staticmethod
    def _is_missing_table_error(exc: sqlite3.OperationalError) -> bool:
        return "no such table" in str(exc).lower()

    def _run_with_schema_retry(self, action: Callable[[sqlite3.Connection], T]) -> T:
        try:
            with self._connect() as conn:
                return action(conn)
        except sqlite3.OperationalError as exc:
            if not self._is_missing_table_error(exc):
                raise
            self._init_tables()
            with self._connect() as conn:
                return action(conn)

    def add_message(self, session_id: str, role: str, content: str) -> None:
        self._run_with_schema_retry(
            lambda conn: conn.execute(
                "INSERT INTO messages(session_id, role, content) VALUES(?, ?, ?)",
                (session_id, role, content),
            )
        )

    def list_recent_messages(self, session_id: str, limit: int = 12) -> list[dict[str, str]]:
        rows = self._run_with_schema_retry(
            lambda conn: conn.execute(
                """
                SELECT role, content
                FROM messages
                WHERE session_id = ?
                ORDER BY id DESC
                LIMIT ?
                """,
                (session_id, limit),
            ).fetchall()
        )
        rows.reverse()
        return [{"role": str(row["role"]), "content": str(row["content"])} for row in rows]

    def count_user_turns(self, session_id: str) -> int:
        row = self._run_with_schema_retry(
            lambda conn: conn.execute(
                "SELECT COUNT(*) AS count FROM messages WHERE session_id = ? AND role = 'user'",
                (session_id,),
            ).fetchone()
        )
        return int(row["count"]) if row else 0

    def upsert_memories(self, session_id: str, memory_writes: list[dict[str, str]]) -> None:
        if not memory_writes:
            return
        self._run_with_schema_retry(
            lambda conn: conn.executemany(
                """
                INSERT INTO memories(session_id, key, value, type)
                VALUES(?, ?, ?, ?)
                """,
                [
                    (
                        session_id,
                        item.get("key", "").strip(),
                        item.get("value", "").strip(),
                        item.get("type", "note").strip(),
                    )
                    for item in memory_writes
                    if item.get("key") and item.get("value")
                ],
            )
        )

    def get_relationship(self, session_id: str) -> dict[str, int]:
        row = self._run_with_schema_retry(
            lambda conn: conn.execute(
                "SELECT trust, reliance, fatigue FROM relationship WHERE session_id = ?",
                (session_id,),
            ).fetchone()
        )
        if row is None:
            return {"trust": 0, "reliance": 0, "fatigue": 0}
        return {
            "trust": int(row["trust"]),
            "reliance": int(row["reliance"]),
            "fatigue": int(row["fatigue"]),
        }

    def apply_relationship_delta(self, session_id: str, delta: dict[str, Any]) -> dict[str, int]:
        trust_delta = int(delta.get("trust", 0) or 0)
        reliance_delta = int(delta.get("reliance", 0) or 0)
        fatigue_delta = int(delta.get("fatigue", 0) or 0)
        current = self.get_relationship(session_id)
        updated = {
            "trust": current["trust"] + trust_delta,
            "reliance": current["reliance"] + reliance_delta,
            "fatigue": current["fatigue"] + fatigue_delta,
        }
        self._run_with_schema_retry(
            lambda conn: conn.execute(
                """
                INSERT INTO relationship(session_id, trust, reliance, fatigue)
                VALUES(?, ?, ?, ?)
                ON CONFLICT(session_id)
                DO UPDATE SET
                  trust = excluded.trust,
                  reliance = excluded.reliance,
                  fatigue = excluded.fatigue,
                  ts = CURRENT_TIMESTAMP
                """,
                (
                    session_id,
                    updated["trust"],
                    updated["reliance"],
                    updated["fatigue"],
                ),
            )
        )
        return {
            "trust": trust_delta,
            "reliance": reliance_delta,
            "fatigue": fatigue_delta,
        }

    def clear_session(self, session_id: str) -> None:
        self._run_with_schema_retry(
            lambda conn: (
                conn.execute("DELETE FROM messages WHERE session_id = ?", (session_id,)),
                conn.execute("DELETE FROM memories WHERE session_id = ?", (session_id,)),
                conn.execute("DELETE FROM relationship WHERE session_id = ?", (session_id,)),
            )
        )
