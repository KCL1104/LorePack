"""Story session management tools.

Manages the lifecycle of story sessions — from conjuration parameters
to active writing sessions with associated lorebooks and chapters.
"""

import json
import uuid
from datetime import UTC, datetime

from app.tools.user_context import resolve_owner_uid

_cached_col = None


def _get_sessions_col():
    """Lazy singleton for Firestore story_sessions collection."""
    global _cached_col
    if _cached_col is None:
        from google.cloud import firestore

        _cached_col = firestore.Client().collection("story_sessions")
    return _cached_col


def create_session(
    genre: str,
    world_era: str,
    world_essence: list[str],
    protagonist_archetype: str,
    protagonist_virtues: list[str],
    protagonist_shadow: str,
    spark: str = "",
    owner_uid: str = "",
) -> str:
    """Create a new story session and an associated lorebook.

    Args:
        genre: Genre selection, e.g. "dark_fantasy", "sci_fi", "horror".
        world_era: World era, e.g. "medieval", "futuristic", "post_apocalyptic".
        world_essence: World essence tags, e.g. ["sword_and_sorcery", "political_intrigue"].
        protagonist_archetype: Archetype, e.g. "the_outcast", "the_scholar".
        protagonist_virtues: Virtue tags, e.g. ["cunning", "fearless"].
        protagonist_shadow: Shadow/flaw, e.g. "grief", "hubris".
        spark: Optional story seed text.

    Returns:
        JSON string containing the new session details.
    """
    from app.tools.lorebook_tools import create_lorebook

    session_id = str(uuid.uuid4())[:8]
    resolved_owner_uid = resolve_owner_uid(owner_uid)
    now = datetime.now(UTC).isoformat()

    # Auto-create an associated lorebook for this session
    genre_display = genre.replace("_", " ").title()
    era_display = world_era.replace("_", " ").title()
    lb_result = json.loads(
        create_lorebook(
            title=f"{genre_display} — {era_display} World",
            genre=genre.replace("_", " "),
            description=f"Auto-created lorebook for story session {session_id}.",
            owner_uid=resolved_owner_uid,
        )
    )

    session = {
        "id": session_id,
        "genre": genre,
        "world_era": world_era,
        "world_essence": world_essence,
        "protagonist_archetype": protagonist_archetype,
        "protagonist_virtues": protagonist_virtues,
        "protagonist_shadow": protagonist_shadow,
        "spark": spark,
        "lorebook_id": lb_result["id"],
        "owner_uid": resolved_owner_uid,
        "status": "conjuring",
        "created_at": now,
        "updated_at": now,
    }
    _get_sessions_col().document(session_id).set(session)

    return json.dumps(session, ensure_ascii=False, indent=2)


def get_session(session_id: str, owner_uid: str = "") -> str:
    """Retrieve a story session.

    Args:
        session_id: Session ID.

    Returns:
        JSON string containing the session details, or an error message.
    """
    resolved_owner_uid = resolve_owner_uid(owner_uid)
    snap = _get_sessions_col().document(session_id).get()
    if not snap.exists:
        return json.dumps(
            {"error": f"Session {session_id} not found"}, ensure_ascii=False
        )

    session = snap.to_dict()
    if session.get("owner_uid") != resolved_owner_uid:
        return json.dumps(
            {"error": f"Session {session_id} not found"}, ensure_ascii=False
        )

    return json.dumps(session, ensure_ascii=False, indent=2)


def update_session_status(session_id: str, status: str, owner_uid: str = "") -> str:
    """Update the status of a story session.

    Args:
        session_id: Session ID.
        status: New status — "conjuring", "active", or "completed".

    Returns:
        JSON string confirming the update.
    """
    resolved_owner_uid = resolve_owner_uid(owner_uid)
    ref = _get_sessions_col().document(session_id)
    snap = ref.get()
    if not snap.exists:
        return json.dumps(
            {"error": f"Session {session_id} not found"}, ensure_ascii=False
        )

    session = snap.to_dict()
    if session.get("owner_uid") != resolved_owner_uid:
        return json.dumps(
            {"error": f"Session {session_id} not found"}, ensure_ascii=False
        )

    now = datetime.now(UTC).isoformat()
    ref.update({"status": status, "updated_at": now})
    return json.dumps(
        {"session_id": session_id, "status": status, "updated_at": now},
        ensure_ascii=False,
        indent=2,
    )


def list_sessions(owner_uid: str = "") -> str:
    """List all story sessions.

    Returns:
        JSON string containing a list of session summaries.
    """
    resolved_owner_uid = resolve_owner_uid(owner_uid)
    sessions = []
    for doc in _get_sessions_col().stream():
        data = doc.to_dict()
        if data.get("owner_uid") != resolved_owner_uid:
            continue
        sessions.append(
            {
                "id": data.get("id", doc.id),
                "genre": data.get("genre", ""),
                "world_era": data.get("world_era", ""),
                "protagonist_archetype": data.get("protagonist_archetype", ""),
                "status": data.get("status", ""),
                "lorebook_id": data.get("lorebook_id", ""),
                "created_at": data.get("created_at", ""),
                "updated_at": data.get("updated_at", ""),
            }
        )
    sessions.sort(key=lambda x: x.get("updated_at", ""), reverse=True)
    return json.dumps(sessions, ensure_ascii=False, indent=2)
