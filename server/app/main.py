"""服务端入口。"""

from __future__ import annotations

from fastapi import FastAPI

from app.api.v1.router import api_router

app = FastAPI(title="Anima Companion Server", version="0.1.0")
app.include_router(api_router)


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}
