"""Image generation endpoints (Type B — agent-powered via SSE)."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from app.api.auth import AuthUser, get_current_user
from app.api.dependencies import get_firestore_client
from app.api.sse import stream_agent_response

router = APIRouter(prefix="/api/images", tags=["images"])
CurrentUser = Annotated[AuthUser, Depends(get_current_user)]


class GenerateImageRequest(BaseModel):
    lorebook_id: str
    entry_name: str
    art_style: str = "anime illustration"
    image_type: str = "character"  # "character" or "scene"


@router.post("/generate")
async def generate_image(
    body: GenerateImageRequest,
    current_user: CurrentUser,
):
    """Generate an image for a lorebook entry via the Visual Artist agent."""
    db = get_firestore_client()
    lorebook_snap = db.collection("lorebooks").document(body.lorebook_id).get()
    if not lorebook_snap.exists:
        raise HTTPException(status_code=404, detail="Lorebook not found")

    lorebook = lorebook_snap.to_dict()
    if lorebook.get("owner_uid") != current_user.uid:
        raise HTTPException(status_code=404, detail="Lorebook not found")

    prompt = (
        f"Generate a {body.image_type} image for '{body.entry_name}' "
        f"from lorebook {body.lorebook_id}. "
        f"Art style: {body.art_style}. "
        f"First read the lorebook entry to get the full description, "
        f"then generate the image. "
        f"When calling image tools, set lorebook_id to '{body.lorebook_id}'."
    )

    return EventSourceResponse(
        stream_agent_response(
            session_id=f"img-{body.lorebook_id}-{body.entry_name}",
            user_message=prompt,
            user_id=current_user.uid,
        ),
    )
