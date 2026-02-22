"""Story session endpoints.

Type A: GET (list sessions) — direct Firestore.
Type B: POST (conjure, message) — agent-powered via SSE.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from app.api.auth import AuthUser, get_current_user
from app.api.dependencies import get_firestore_client

router = APIRouter(prefix="/api/sessions", tags=["sessions"])
CurrentUser = Annotated[AuthUser, Depends(get_current_user)]


class ConjureRequest(BaseModel):
    genre: str
    world_era: str
    world_essence: list[str]
    protagonist_archetype: str
    protagonist_virtues: list[str]
    protagonist_shadow: str
    spark: str = ""


class MessageRequest(BaseModel):
    text: str


def _require_owned_session(db, session_id: str, owner_uid: str) -> dict:
    session_ref = db.collection("story_sessions").document(session_id)
    session_snap = session_ref.get()
    if not session_snap.exists:
        raise HTTPException(status_code=404, detail="Session not found")

    session = session_snap.to_dict()
    if session.get("owner_uid") != owner_uid:
        raise HTTPException(status_code=404, detail="Session not found")

    return session


@router.get("")
async def list_sessions(current_user: CurrentUser):
    """List all story sessions."""
    db = get_firestore_client()
    sessions = []
    query = db.collection("story_sessions").where("owner_uid", "==", current_user.uid)
    for doc in query.stream():
        data = doc.to_dict()
        sessions.append(
            {
                "id": doc.id,
                "genre": data.get("genre", ""),
                "world_era": data.get("world_era", ""),
                "world_essence": data.get("world_essence", []),
                "protagonist_archetype": data.get("protagonist_archetype", ""),
                "status": data.get("status", ""),
                "lorebook_id": data.get("lorebook_id", ""),
                "created_at": data.get("created_at", ""),
                "updated_at": data.get("updated_at", ""),
            }
        )
    sessions.sort(key=lambda x: x.get("updated_at", ""), reverse=True)
    return sessions


@router.get("/{session_id}")
async def get_session(
    session_id: str,
    current_user: CurrentUser,
):
    """Get a story session with its chapters."""
    db = get_firestore_client()
    session = _require_owned_session(db, session_id, current_user.uid)

    # Fetch chapters from the associated lorebook's story
    lorebook_id = session.get("lorebook_id", "")
    chapters = []
    if lorebook_id:
        chapters_ref = (
            db.collection("stories")
            .document(lorebook_id)
            .collection("chapters")
        )
        for ch in chapters_ref.order_by("chapter_number").stream():
            ch_data = ch.to_dict()
            if ch_data.get("owner_uid") != current_user.uid:
                continue
            chapters.append(
                {
                    "chapter_number": ch_data.get("chapter_number"),
                    "chapter_title": ch_data.get("chapter_title"),
                    "body": ch_data.get("body", ""),
                    "characters_featured": ch_data.get("characters_featured", []),
                    "lore_referenced": ch_data.get("lore_referenced", []),
                }
            )

    session["chapters"] = chapters
    return session


# --- Type B: Agent-powered via SSE ---


@router.post("/conjure")
async def conjure_session(
    body: ConjureRequest,
    current_user: CurrentUser,
):
    """Create a new story session and stream the agent's world conjuration via SSE."""
    import json

    from app.api.sse import stream_agent_response
    from app.tools.session_tools import create_session

    session = json.loads(
        create_session(
            genre=body.genre,
            world_era=body.world_era,
            world_essence=body.world_essence,
            protagonist_archetype=body.protagonist_archetype,
            protagonist_virtues=body.protagonist_virtues,
            protagonist_shadow=body.protagonist_shadow,
            spark=body.spark,
            owner_uid=current_user.uid,
        )
    )

    # Build a prompt that tells the agent what to conjure
    essence_str = ", ".join(body.world_essence) if body.world_essence else "unspecified"
    virtues_str = ", ".join(body.protagonist_virtues) if body.protagonist_virtues else "unspecified"
    spark_str = f'\nStory spark: "{body.spark}"' if body.spark else ""

    conjure_prompt = (
        f"Conjure a new world for story session {session['id']}. "
        f"Genre: {body.genre}. Era: {body.world_era}. Essence: {essence_str}. "
        f"Protagonist archetype: {body.protagonist_archetype}. "
        f"Virtues: {virtues_str}. Shadow/flaw: {body.protagonist_shadow}."
        f"{spark_str}\n"
        f"The associated lorebook ID is {session['lorebook_id']}. "
        f"Please create the world, protagonist, and key locations, "
        f"recording each as a lorebook entry."
    )

    return EventSourceResponse(
        stream_agent_response(
            session_id=session["id"],
            user_message=conjure_prompt,
            user_id=current_user.uid,
        ),
        headers={"X-Session-Id": session["id"], "X-Lorebook-Id": session["lorebook_id"]},
    )


@router.post("/{session_id}/message")
async def send_message(
    session_id: str,
    body: MessageRequest,
    current_user: CurrentUser,
):
    """Send a direction to an active story session and stream the agent's response via SSE."""
    db = get_firestore_client()
    _require_owned_session(db, session_id, current_user.uid)

    from app.api.sse import stream_agent_response

    return EventSourceResponse(
        stream_agent_response(
            session_id=session_id,
            user_message=body.text,
            user_id=current_user.uid,
        ),
    )
