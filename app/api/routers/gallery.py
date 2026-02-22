"""Gallery endpoints (Type A — direct Firestore + GCS)."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.api.auth import AuthUser, get_current_user
from app.api.dependencies import get_firestore_client

router = APIRouter(prefix="/api/gallery", tags=["gallery"])
CurrentUser = Annotated[AuthUser, Depends(get_current_user)]


@router.get("")
async def list_images(
    current_user: CurrentUser,
    asset_type: str | None = None,
    lorebook_id: str | None = None,
):
    """List generated images, optionally filtered by type or lorebook."""
    db = get_firestore_client()
    query = db.collection("image_assets").where("owner_uid", "==", current_user.uid)

    if asset_type:
        query = query.where("asset_type", "==", asset_type)

    if lorebook_id:
        query = query.where("lorebook_id", "==", lorebook_id)

    images = []
    for doc in query.stream():
        data = doc.to_dict()
        images.append(
            {
                "id": doc.id,
                "asset_type": data.get("asset_type", ""),
                "character_name": data.get("character_name", ""),
                "scene_name": data.get("scene_name", ""),
                "prompt_used": data.get("prompt_used", ""),
                "gs_uri": data.get("gs_uri", ""),
                "lorebook_id": data.get("lorebook_id", ""),
                "art_style": data.get("art_style", ""),
                "generated_at": data.get("generated_at", ""),
            }
        )
    images.sort(key=lambda x: x.get("generated_at", ""), reverse=True)
    return images


@router.get("/{image_id}")
async def get_image(image_id: str, current_user: CurrentUser):
    """Get image details with a signed URL."""
    db = get_firestore_client()
    doc = db.collection("image_assets").document(image_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Image not found")

    data = doc.to_dict()
    if data.get("owner_uid") != current_user.uid:
        raise HTTPException(status_code=404, detail="Image not found")

    signed_url = None
    gs_uri = data.get("gs_uri", "")
    if gs_uri:
        from app.tools.gcs_tools import get_signed_url

        signed_url = get_signed_url(gs_uri)

    return {
        "id": doc.id,
        **data,
        "signed_url": signed_url,
    }
