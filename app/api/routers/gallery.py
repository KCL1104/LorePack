"""Gallery endpoints (Type A — direct Firestore + GCS)."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.api.auth import AuthUser, get_current_user
from app.api.dependencies import get_firestore_client

router = APIRouter(prefix="/api/gallery", tags=["gallery"])
CurrentUser = Annotated[AuthUser, Depends(get_current_user)]


def _as_iso_string(value: object) -> str:
    """Normalize Firestore timestamp-like values into ISO strings."""
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    isoformat = getattr(value, "isoformat", None)
    if callable(isoformat):
        return isoformat()
    return str(value)


@router.get("")
async def list_images(
    current_user: CurrentUser,
    asset_type: str | None = None,
    lorebook_id: str | None = None,
    include_signed_url: bool = False,
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
        generated_at = _as_iso_string(data.get("generated_at", ""))
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
                "pose": data.get("pose", ""),
                "mood": data.get("mood", ""),
                "generated_at": generated_at,
                "signed_url": None,
            }
        )
    images.sort(key=lambda x: x.get("generated_at", ""), reverse=True)

    if include_signed_url:
        import asyncio

        from app.tools.gcs_tools import get_signed_url

        async def _resolve_signed_url(image: dict):
            gs_uri = image.get("gs_uri", "")
            if not gs_uri:
                image["signed_url"] = None
                return
            try:
                image["signed_url"] = await asyncio.to_thread(get_signed_url, gs_uri)
            except Exception:
                image["signed_url"] = None

        await asyncio.gather(*[_resolve_signed_url(image) for image in images])

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
        import asyncio

        from app.tools.gcs_tools import get_signed_url

        signed_url = await asyncio.to_thread(get_signed_url, gs_uri)

    return {
        "id": doc.id,
        **data,
        "signed_url": signed_url,
    }
