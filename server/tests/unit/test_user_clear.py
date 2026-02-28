from __future__ import annotations

import sqlite3

from fastapi.testclient import TestClient

from app.dependencies import get_session_store
from app.main import app
from app.repositories.session_store import SessionStore


def test_user_clear_endpoint_removes_all_session_records(tmp_path) -> None:
    db_path = tmp_path / "session.db"
    store = SessionStore(db_path)
    session_id = "s-clear-1"
    store.add_message(session_id, "user", "hello")
    store.add_message(session_id, "assistant", "hi")
    store.upsert_memories(
        session_id,
        [{"key": "drink", "value": "tea", "type": "preference"}],
    )
    store.apply_relationship_delta(session_id, {"trust": 2, "reliance": 1, "fatigue": -1})

    app.dependency_overrides[get_session_store] = lambda: store
    with TestClient(app) as client:
        resp = client.post("/v1/user/clear", json={"session_id": session_id})
    app.dependency_overrides.clear()

    assert resp.status_code == 200
    assert resp.json() == {"ok": True}

    with sqlite3.connect(db_path) as conn:
        msg_count = conn.execute(
            "SELECT COUNT(*) FROM messages WHERE session_id = ?",
            (session_id,),
        ).fetchone()[0]
        memory_count = conn.execute(
            "SELECT COUNT(*) FROM memories WHERE session_id = ?",
            (session_id,),
        ).fetchone()[0]
        relation_count = conn.execute(
            "SELECT COUNT(*) FROM relationship WHERE session_id = ?",
            (session_id,),
        ).fetchone()[0]

    assert msg_count == 0
    assert memory_count == 0
    assert relation_count == 0


def test_session_store_auto_repairs_missing_messages_table(tmp_path) -> None:
    db_path = tmp_path / "session.db"
    store = SessionStore(db_path)
    session_id = "s-repair-1"

    with sqlite3.connect(db_path) as conn:
        conn.execute("DROP TABLE messages")

    store.add_message(session_id, "user", "hello")
    rows = store.list_recent_messages(session_id, limit=5)

    assert rows == [{"role": "user", "content": "hello"}]
