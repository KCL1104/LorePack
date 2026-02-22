"""Lorebook CRUD endpoints (Type A — direct Firestore)."""

import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.auth import AuthUser, get_current_user
from app.api.dependencies import get_firestore_client

router = APIRouter(prefix="/api/lorebooks", tags=["lorebooks"])
CurrentUser = Annotated[AuthUser, Depends(get_current_user)]


class EntryUpdate(BaseModel):
    category: str | None = None
    name: str | None = None
    content: str | None = None
    tags: list[str] | None = None
    visibility: str | None = None


class EntryCreate(BaseModel):
    category: str
    name: str
    content: str
    tags: list[str] = Field(default_factory=list)
    visibility: str = "private"


def _require_owned_lorebook(db, lorebook_id: str, owner_uid: str) -> dict:
    lorebook_ref = db.collection("lorebooks").document(lorebook_id)
    lorebook_snap = lorebook_ref.get()
    if not lorebook_snap.exists:
        raise HTTPException(status_code=404, detail=f"Lorebook {lorebook_id} not found")

    lorebook = lorebook_snap.to_dict()
    if lorebook.get("owner_uid") != owner_uid:
        raise HTTPException(status_code=404, detail=f"Lorebook {lorebook_id} not found")

    return lorebook


@router.get("")
async def list_lorebooks(current_user: CurrentUser):
    """List all lorebooks with summary info."""
    db = get_firestore_client()
    col = db.collection("lorebooks")
    summaries = []
    for lb_snap in col.where("owner_uid", "==", current_user.uid).stream():
        lb = lb_snap.to_dict()
        lb_id = lb["id"]
        entry_count = sum(
            1
            for entry in col.document(lb_id).collection("entries").stream()
            if entry.to_dict().get("owner_uid") == current_user.uid
        )
        summaries.append(
            {
                "id": lb_id,
                "title": lb["title"],
                "genre": lb.get("genre", ""),
                "description": lb.get("description", ""),
                "entry_count": entry_count,
                "updated_at": lb.get("updated_at", ""),
            }
        )
    return summaries


@router.get("/{lorebook_id}")
async def get_lorebook(
    lorebook_id: str,
    current_user: CurrentUser,
):
    """Get a lorebook with all its entries."""
    db = get_firestore_client()
    lorebook = _require_owned_lorebook(db, lorebook_id, current_user.uid)
    entries_ref = db.collection("lorebooks").document(lorebook_id).collection("entries")
    entries = []
    for e in entries_ref.stream():
        entry = e.to_dict()
        if entry.get("owner_uid") != current_user.uid:
            continue
        entry.pop("embedding", None)
        entries.append(entry)
    lorebook["entries"] = entries
    return lorebook


@router.post("/{lorebook_id}/entries", status_code=201)
async def create_entry(
    lorebook_id: str,
    body: EntryCreate,
    current_user: CurrentUser,
):
    """Create a lorebook entry."""
    from app.tools.lorebook_tools import add_lorebook_entry

    db = get_firestore_client()
    _require_owned_lorebook(db, lorebook_id, current_user.uid)

    result = json.loads(
        add_lorebook_entry(
            lorebook_id=lorebook_id,
            category=body.category,
            name=body.name,
            content=body.content,
            tags=", ".join(body.tags),
            visibility=body.visibility,
            owner_uid=current_user.uid,
        )
    )

    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])

    return result


@router.put("/{lorebook_id}/entries/{entry_id}")
async def update_entry(
    lorebook_id: str,
    entry_id: str,
    body: EntryUpdate,
    current_user: CurrentUser,
):
    """Update a lorebook entry."""
    db = get_firestore_client()
    _require_owned_lorebook(db, lorebook_id, current_user.uid)

    entry_ref = (
        db.collection("lorebooks")
        .document(lorebook_id)
        .collection("entries")
        .document(entry_id)
    )
    entry_snap = entry_ref.get()
    if not entry_snap.exists:
        raise HTTPException(status_code=404, detail="Entry not found")

    entry = entry_snap.to_dict()
    if entry.get("owner_uid") != current_user.uid:
        raise HTTPException(status_code=404, detail="Entry not found")

    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    entry_ref.update(updates)

    # Re-embed if content changed
    if "content" in updates or "name" in updates:
        from app.tools.rag_tools import embed_and_store_entry

        try:
            embed_and_store_entry(lorebook_id, entry_id, owner_uid=current_user.uid)
        except TypeError:
            embed_and_store_entry(lorebook_id, entry_id)

    return entry_ref.get().to_dict()


@router.delete("/{lorebook_id}/entries/{entry_id}", status_code=204)
async def delete_entry(
    lorebook_id: str,
    entry_id: str,
    current_user: CurrentUser,
):
    """Delete a lorebook entry."""
    db = get_firestore_client()
    _require_owned_lorebook(db, lorebook_id, current_user.uid)

    entry_ref = (
        db.collection("lorebooks")
        .document(lorebook_id)
        .collection("entries")
        .document(entry_id)
    )
    entry_snap = entry_ref.get()
    if not entry_snap.exists:
        raise HTTPException(status_code=404, detail="Entry not found")

    entry = entry_snap.to_dict()
    if entry.get("owner_uid") != current_user.uid:
        raise HTTPException(status_code=404, detail="Entry not found")

    entry_ref.delete()


@router.post("/{lorebook_id}/validate")
async def validate_lorebook(
    lorebook_id: str,
    current_user: CurrentUser,
):
    """Validate lorebook consistency."""
    from app.tools.lorebook_tools import validate_lorebook_consistency

    db = get_firestore_client()
    _require_owned_lorebook(db, lorebook_id, current_user.uid)

    result = json.loads(
        validate_lorebook_consistency(lorebook_id, owner_uid=current_user.uid)
    )
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])

    return result
