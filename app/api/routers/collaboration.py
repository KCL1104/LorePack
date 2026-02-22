"""Collaboration endpoints (Type A + Type B)."""

import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.auth import AuthUser, get_current_user

router = APIRouter(prefix="/api/collaboration", tags=["collaboration"])
CurrentUser = Annotated[AuthUser, Depends(get_current_user)]


@router.get("/public")
async def list_public_lorebooks(current_user: CurrentUser):
    """List lorebooks that have at least one public entry."""
    from app.tools.collaboration_tools import list_public_lorebooks as list_public

    return json.loads(list_public(requester_uid=current_user.uid))


class ImportRequest(BaseModel):
    lorebook_id: str


class CrossoverRequest(BaseModel):
    source_lorebook_id: str
    target_lorebook_id: str
    character_names: list[str]


@router.post("/import")
async def import_lorebook(
    body: ImportRequest,
    current_user: CurrentUser,
):
    """Import a public lorebook by exporting and re-importing it."""
    from app.tools.collaboration_tools import export_lorebook, import_lorebook

    package = export_lorebook(body.lorebook_id, requester_uid=current_user.uid)
    exported = json.loads(package)
    if "error" in exported:
        raise HTTPException(status_code=404, detail=exported["error"])

    result = json.loads(import_lorebook(package, owner_uid=current_user.uid))
    return result


@router.post("/crossover")
async def propose_crossover(
    body: CrossoverRequest,
    current_user: CurrentUser,
):
    """Propose a character crossover between two lorebooks."""
    from app.tools.collaboration_tools import propose_crossover

    names_str = ", ".join(body.character_names)
    result = json.loads(
        propose_crossover(
            body.source_lorebook_id,
            body.target_lorebook_id,
            names_str,
            requester_uid=current_user.uid,
        )
    )
    if "error" in result:
        status_code = 403 if "Not authorized" in result["error"] else 404
        raise HTTPException(status_code=status_code, detail=result["error"])
    return result


@router.post("/crossover/accept")
async def accept_crossover(
    proposal: dict,
    current_user: CurrentUser,
):
    """Accept a crossover proposal and copy characters to the target lorebook."""
    from app.tools.collaboration_tools import accept_crossover

    result = json.loads(
        accept_crossover(
            json.dumps(proposal),
            requester_uid=current_user.uid,
        )
    )
    if "error" in result:
        status_code = 403 if "Not authorized" in result["error"] else 404
        raise HTTPException(status_code=status_code, detail=result["error"])
    return result
