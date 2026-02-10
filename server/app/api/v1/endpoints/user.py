"""用户数据接口。"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.dependencies import get_session_store
from app.repositories.session_store import SessionStore
from app.schemas.chat import UserClearRequest, UserClearResponse

router = APIRouter(prefix="/v1/user", tags=["user"])


@router.post("/clear", response_model=UserClearResponse)
def clear_user_data(
    req: UserClearRequest,
    store: SessionStore = Depends(get_session_store),
) -> UserClearResponse:
    store.clear_session(req.session_id)
    return UserClearResponse(ok=True)
