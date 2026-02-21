# Collaboration tools for cross-user lorebook sharing
# Provides export/import, public listing, and crossover proposal capabilities
# Designed for sharing via the A2A protocol between agents

import json
import uuid
from datetime import UTC, datetime

_cached_col = None


def _get_lorebooks_col():
    """Lazy singleton for Firestore collection."""
    global _cached_col
    if _cached_col is None:
        from google.cloud import firestore

        _cached_col = firestore.Client().collection("lorebooks")
    return _cached_col


def export_lorebook(lorebook_id: str) -> str:
    """Export a lorebook's public entries as a shareable JSON package.

    Reads the lorebook and its entries from Firestore, filters to only
    include entries with visibility == "public", and strips out embedding
    vectors to save bandwidth. The resulting JSON package can be shared
    with other users' agents via the A2A protocol.

    Args:
        lorebook_id: ID of the lorebook to export.

    Returns:
        JSON string containing lorebook metadata and public entries
        (without embeddings), or an error message.
    """
    lb_snap = _get_lorebooks_col().document(lorebook_id).get()
    if not lb_snap.exists:
        return json.dumps(
            {"error": f"Lorebook {lorebook_id} not found"}, ensure_ascii=False
        )

    lorebook = lb_snap.to_dict()
    entries_ref = _get_lorebooks_col().document(lorebook_id).collection("entries")
    public_entries = []
    for entry_snap in entries_ref.stream():
        entry = entry_snap.to_dict()
        if entry.get("visibility") == "public":
            entry.pop("embedding", None)
            public_entries.append(entry)

    package = {
        "id": lorebook["id"],
        "title": lorebook["title"],
        "genre": lorebook.get("genre", ""),
        "description": lorebook.get("description", ""),
        "exported_at": datetime.now(UTC).isoformat(),
        "entries": public_entries,
    }
    return json.dumps(package, ensure_ascii=False, indent=2)


def import_lorebook(lorebook_data: str) -> str:
    """Import a lorebook from a JSON package (as produced by export_lorebook).

    Creates a new lorebook in Firestore with a new ID and a title prefixed
    with "[Imported]". All entries are imported and embeddings are
    auto-computed for each.

    Args:
        lorebook_data: JSON string containing lorebook metadata and entries.

    Returns:
        JSON string with the new lorebook ID and an import summary.
    """
    from app.tools.rag_tools import embed_and_store_entry

    data = json.loads(lorebook_data)
    new_id = str(uuid.uuid4())[:8]
    now = datetime.now(UTC).isoformat()

    lorebook = {
        "id": new_id,
        "title": f"[Imported] {data['title']}",
        "genre": data.get("genre", ""),
        "description": data.get("description", ""),
        "created_at": now,
        "updated_at": now,
    }
    _get_lorebooks_col().document(new_id).set(lorebook)

    entries = data.get("entries", [])
    imported_count = 0
    for entry in entries:
        entry_id = str(uuid.uuid4())[:8]
        new_entry = {
            "id": entry_id,
            "category": entry.get("category", "other"),
            "name": entry["name"],
            "content": entry["content"],
            "tags": entry.get("tags", []),
            "visibility": entry.get("visibility", "private"),
            "created_at": now,
        }
        _get_lorebooks_col().document(new_id).collection("entries").document(
            entry_id
        ).set(new_entry)
        embed_and_store_entry(new_id, entry_id)
        imported_count += 1

    result = {
        "lorebook_id": new_id,
        "title": lorebook["title"],
        "entries_imported": imported_count,
        "status": "success",
    }
    return json.dumps(result, ensure_ascii=False, indent=2)


def list_public_lorebooks() -> str:
    """List lorebooks that have at least one public entry.

    Queries Firestore for all lorebooks, counts how many entries in each
    have visibility == "public", and returns only those with at least one.

    Returns:
        JSON list of objects with id, title, genre, and public_entry_count.
    """
    results = []
    for lb_snap in _get_lorebooks_col().stream():
        lb = lb_snap.to_dict()
        lb_id = lb["id"]
        entries_ref = _get_lorebooks_col().document(lb_id).collection("entries")
        public_count = sum(
            1 for e in entries_ref.stream() if e.to_dict().get("visibility") == "public"
        )
        if public_count > 0:
            results.append(
                {
                    "id": lb_id,
                    "title": lb["title"],
                    "genre": lb.get("genre", ""),
                    "public_entry_count": public_count,
                }
            )
    return json.dumps(results, ensure_ascii=False, indent=2)


def propose_crossover(
    source_lorebook_id: str,
    target_lorebook_id: str,
    character_names: str,
) -> str:
    """Create a crossover proposal to bring characters from one lorebook into another.

    Looks up each named character entry in the source lorebook and checks
    for naming conflicts in the target lorebook. Returns a proposal with
    the character details and any detected conflicts.

    Args:
        source_lorebook_id: ID of the lorebook to pull characters from.
        target_lorebook_id: ID of the lorebook to receive characters.
        character_names: Comma-separated list of character names to cross over.

    Returns:
        JSON string with proposal details including characters found,
        characters not found, and any naming conflicts in the target.
    """
    # Validate both lorebooks exist
    source_snap = _get_lorebooks_col().document(source_lorebook_id).get()
    if not source_snap.exists:
        return json.dumps(
            {"error": f"Source lorebook {source_lorebook_id} not found"},
            ensure_ascii=False,
        )
    target_snap = _get_lorebooks_col().document(target_lorebook_id).get()
    if not target_snap.exists:
        return json.dumps(
            {"error": f"Target lorebook {target_lorebook_id} not found"},
            ensure_ascii=False,
        )

    names = [n.strip() for n in character_names.split(",") if n.strip()]

    # Gather source entries
    source_entries_ref = (
        _get_lorebooks_col().document(source_lorebook_id).collection("entries")
    )
    source_entries = {
        e.to_dict()["name"]: e.to_dict() for e in source_entries_ref.stream()
    }

    # Gather target entry names for conflict detection
    target_entries_ref = (
        _get_lorebooks_col().document(target_lorebook_id).collection("entries")
    )
    target_names = {e.to_dict()["name"] for e in target_entries_ref.stream()}

    characters = []
    not_found = []
    conflicts = []

    for name in names:
        if name in source_entries:
            entry = source_entries[name]
            entry.pop("embedding", None)
            characters.append(entry)
            if name in target_names:
                conflicts.append(name)
        else:
            not_found.append(name)

    proposal = {
        "source_lorebook_id": source_lorebook_id,
        "target_lorebook_id": target_lorebook_id,
        "characters": characters,
        "not_found": not_found,
        "conflicts": conflicts,
        "has_conflicts": len(conflicts) > 0,
    }
    return json.dumps(proposal, ensure_ascii=False, indent=2)


def accept_crossover(proposal_json: str) -> str:
    """Accept a crossover proposal and copy character entries into the target lorebook.

    Takes a proposal JSON (as produced by propose_crossover), copies each
    character entry into the target lorebook, and auto-computes embeddings.

    Args:
        proposal_json: JSON string of the crossover proposal.

    Returns:
        JSON string with confirmation of copied entries.
    """
    from app.tools.rag_tools import embed_and_store_entry

    proposal = json.loads(proposal_json)
    target_id = proposal["target_lorebook_id"]
    now = datetime.now(UTC).isoformat()

    target_snap = _get_lorebooks_col().document(target_id).get()
    if not target_snap.exists:
        return json.dumps(
            {"error": f"Target lorebook {target_id} not found"}, ensure_ascii=False
        )

    copied = []
    for char in proposal.get("characters", []):
        entry_id = str(uuid.uuid4())[:8]
        new_entry = {
            "id": entry_id,
            "category": char.get("category", "character"),
            "name": char["name"],
            "content": char["content"],
            "tags": char.get("tags", []),
            "visibility": char.get("visibility", "private"),
            "created_at": now,
        }
        _get_lorebooks_col().document(target_id).collection("entries").document(
            entry_id
        ).set(new_entry)
        embed_and_store_entry(target_id, entry_id)
        copied.append({"name": char["name"], "entry_id": entry_id})

    _get_lorebooks_col().document(target_id).update({"updated_at": now})

    result = {
        "target_lorebook_id": target_id,
        "entries_copied": len(copied),
        "copied": copied,
        "status": "success",
    }
    return json.dumps(result, ensure_ascii=False, indent=2)
