"""FastAPI gateway for the LorePack frontend.

Type A endpoints: direct Firestore CRUD (no agent needed).
Type B endpoints: agent-powered via ADK with SSE streaming.
"""

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routers import (
    a2a_registry,
    collaboration,
    gallery,
    images,
    lorebooks,
    sessions,
)

_logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Defer heavy agent import until after uvicorn is ready to accept requests.
    # This ensures the /api/health startup probe passes before the agent loads.
    try:
        from app.a2a.server import mount_a2a_server

        mount_a2a_server(app)
    except Exception:
        _logger.exception("A2A server mount failed — A2A endpoints unavailable")
    yield


app = FastAPI(
    title="LorePack API",
    version="0.1.0",
    description="REST gateway for LorePack — collaborative worldbuilding & story generation.",
    lifespan=lifespan,
)

_default_origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "https://lorepack.xyz",
    "https://www.lorepack.xyz",
]
_extra_origins = os.environ.get("ALLOWED_ORIGINS", "").split(",")
_all_origins = _default_origins + [o.strip() for o in _extra_origins if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_all_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(lorebooks.router)
app.include_router(gallery.router)
app.include_router(sessions.router)
app.include_router(images.router)
app.include_router(collaboration.router)
app.include_router(a2a_registry.router)
app.include_router(a2a_registry.a2a_agent_router)


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "lorepack-api"}
