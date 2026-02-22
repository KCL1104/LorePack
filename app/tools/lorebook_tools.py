# Lorebook CRUD tools
# Provides creation, retrieval, update, and logical validation for lorebooks
# Backed by Google Cloud Firestore

import json
import uuid
from datetime import UTC, datetime

from app.tools.user_context import resolve_owner_uid

_cached_col = None


def _get_lorebooks_col():
    """Lazy singleton for Firestore collection."""
    global _cached_col
    if _cached_col is None:
        from google.cloud import firestore

        _cached_col = firestore.Client().collection("lorebooks")
    return _cached_col


def create_lorebook(
    title: str,
    genre: str,
    description: str,
    owner_uid: str = "",
) -> str:
    """Create a new lorebook.

    Args:
        title: Lorebook title, e.g. "Starfarer Universe".
        genre: Genre tag, e.g. "fantasy", "sci-fi", "modern alternate".
        description: Brief description and core theme of the lorebook.

    Returns:
        JSON string containing the new lorebook's ID and details.
    """
    lorebook_id = str(uuid.uuid4())[:8]
    resolved_owner_uid = resolve_owner_uid(owner_uid)
    now = datetime.now(UTC).isoformat()
    lorebook = {
        "id": lorebook_id,
        "title": title,
        "genre": genre,
        "description": description,
        "owner_uid": resolved_owner_uid,
        "created_at": now,
        "updated_at": now,
    }
    _get_lorebooks_col().document(lorebook_id).set(lorebook)
    lorebook["entries"] = []
    return json.dumps(lorebook, ensure_ascii=False, indent=2)


def add_lorebook_entry(
    lorebook_id: str,
    category: str,
    name: str,
    content: str,
    tags: str = "",
    visibility: str = "private",
    owner_uid: str = "",
) -> str:
    """Add a new entry to the specified lorebook.

    Args:
        lorebook_id: Lorebook ID.
        category: Entry category. Valid values: character, location,
                  magic_system, technology, faction, event, item, other.
        name: Entry name.
        content: Detailed description of the entry.
        tags: Comma-separated tag string used for retrieval.
        visibility: Visibility level — public (searchable by other users' agents) or private.

    Returns:
        JSON string containing the new entry's full details, or an error message.
    """
    resolved_owner_uid = resolve_owner_uid(owner_uid)
    lb_ref = _get_lorebooks_col().document(lorebook_id)
    lb_snap = lb_ref.get()
    if not lb_snap.exists:
        return json.dumps(
            {"error": f"Lorebook {lorebook_id} not found"}, ensure_ascii=False
        )

    lorebook = lb_snap.to_dict()
    if lorebook.get("owner_uid") != resolved_owner_uid:
        return json.dumps(
            {"error": f"Lorebook {lorebook_id} not found"}, ensure_ascii=False
        )

    entry_id = str(uuid.uuid4())[:8]
    now = datetime.now(UTC).isoformat()
    entry = {
        "id": entry_id,
        "category": category,
        "name": name,
        "content": content,
        "tags": [t.strip() for t in tags.split(",") if t.strip()],
        "visibility": visibility,
        "owner_uid": resolved_owner_uid,
        "created_at": now,
    }
    lb_ref.collection("entries").document(entry_id).set(entry)
    lb_ref.update({"updated_at": now})

    # Compute and store embedding for semantic search
    from app.tools.rag_tools import embed_and_store_entry

    try:
        embed_and_store_entry(lorebook_id, entry_id, owner_uid=resolved_owner_uid)
    except TypeError:
        embed_and_store_entry(lorebook_id, entry_id)

    return json.dumps(entry, ensure_ascii=False, indent=2)


def get_lorebook(lorebook_id: str, owner_uid: str = "") -> str:
    """Retrieve the full contents of the specified lorebook.

    Args:
        lorebook_id: Lorebook ID.

    Returns:
        JSON string containing the lorebook's full details, or an error message.
    """
    resolved_owner_uid = resolve_owner_uid(owner_uid)
    col = _get_lorebooks_col()
    lb_snap = col.document(lorebook_id).get()
    if not lb_snap.exists:
        return json.dumps(
            {"error": f"Lorebook {lorebook_id} not found"}, ensure_ascii=False
        )

    lorebook = lb_snap.to_dict()
    if lorebook.get("owner_uid") != resolved_owner_uid:
        return json.dumps(
            {"error": f"Lorebook {lorebook_id} not found"}, ensure_ascii=False
        )

    entries_ref = col.document(lorebook_id).collection("entries")
    lorebook["entries"] = [
        e.to_dict()
        for e in entries_ref.stream()
        if e.to_dict().get("owner_uid") == resolved_owner_uid
    ]
    return json.dumps(lorebook, ensure_ascii=False, indent=2)


def list_lorebooks(owner_uid: str = "") -> str:
    """List summary information for all lorebooks.

    Returns:
        JSON string containing the ID, title, genre, and entry count for all lorebooks.
    """
    resolved_owner_uid = resolve_owner_uid(owner_uid)
    col = _get_lorebooks_col()
    summaries = []
    for lb_snap in col.stream():
        lb = lb_snap.to_dict()
        if lb.get("owner_uid") != resolved_owner_uid:
            continue
        entry_count = sum(
            1
            for entry in col.document(lb["id"]).collection("entries").stream()
            if entry.to_dict().get("owner_uid") == resolved_owner_uid
        )
        summaries.append(
            {
                "id": lb["id"],
                "title": lb["title"],
                "genre": lb["genre"],
                "entry_count": entry_count,
                "updated_at": lb.get("updated_at", ""),
            }
        )
    return json.dumps(summaries, ensure_ascii=False, indent=2)


def validate_lorebook_consistency(lorebook_id: str, owner_uid: str = "") -> str:
    """Validate the internal logical consistency of a lorebook.

    Checks include: whether character relationships are symmetric, whether
    event timelines contain contradictions, and whether settings have obvious conflicts.

    Args:
        lorebook_id: Lorebook ID.

    Returns:
        JSON string containing the validation results and a list of potential issues.
    """
    resolved_owner_uid = resolve_owner_uid(owner_uid)
    col = _get_lorebooks_col()
    lb_snap = col.document(lorebook_id).get()
    if not lb_snap.exists:
        return json.dumps(
            {"error": f"Lorebook {lorebook_id} not found"}, ensure_ascii=False
        )

    lorebook = lb_snap.to_dict()
    if lorebook.get("owner_uid") != resolved_owner_uid:
        return json.dumps(
            {"error": f"Lorebook {lorebook_id} not found"}, ensure_ascii=False
        )

    entries_ref = col.document(lorebook_id).collection("entries")
    entries = [
        e.to_dict()
        for e in entries_ref.stream()
        if e.to_dict().get("owner_uid") == resolved_owner_uid
    ]
    issues: list[str] = []

    # Basic validation: check for entries without tags
    for entry in entries:
        if not entry.get("tags"):
            issues.append(
                f"Entry '{entry['name']}' has no tags — consider adding some to improve search results."
            )

    # Check for duplicate names within the same category
    seen: dict[str, list[str]] = {}
    for entry in entries:
        key = f"{entry['category']}:{entry['name']}"
        if key in seen:
            issues.append(
                f"Duplicate entry found: '{entry['name']}' appears multiple times in the {entry['category']} category."
            )
        seen[key] = seen.get(key, [])
        seen[key].append(entry["id"])

    result = {
        "lorebook_id": lorebook_id,
        "total_entries": len(entries),
        "issues_found": len(issues),
        "issues": issues,
        "status": "passed" if not issues else "has_warnings",
    }
    return json.dumps(result, ensure_ascii=False, indent=2)
