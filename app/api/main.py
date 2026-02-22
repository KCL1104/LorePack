"""FastAPI gateway for the LorePack frontend.

Type A endpoints: direct Firestore CRUD (no agent needed).
Type B endpoints: agent-powered via ADK with SSE streaming.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routers import collaboration, gallery, images, lorebooks, sessions

app = FastAPI(
    title="LorePack API",
    version="0.1.0",
    description="REST gateway for LorePack — collaborative worldbuilding & story generation.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
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
