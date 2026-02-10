"""应用依赖注入。"""

from __future__ import annotations

from functools import lru_cache

from app.core.settings import get_settings
from app.repositories.session_store import SessionStore


@lru_cache(maxsize=1)
def get_session_store() -> SessionStore:
    settings = get_settings()
    return SessionStore(settings.sqlite_db_path)


def clear_dependency_cache() -> None:
    get_session_store.cache_clear()
