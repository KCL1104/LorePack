"""FastAPI gateway for the LorePack frontend.

Type A endpoints: direct Firestore CRUD (no agent needed).
Type B endpoints: agent-powered via ADK with SSE streaming.
"""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routers import collaboration, gallery, images, lorebooks, sessions

app = FastAPI(
    title="LorePack API",
    version="0.1.0",
    description="REST gateway for LorePack — collaborative worldbuilding & story generation.",
)

_default_origins = ["http://localhost:5173", "http://localhost:3000"]
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


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "lorepack-api"}
