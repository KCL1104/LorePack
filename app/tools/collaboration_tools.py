# Collaboration tools for cross-user lorebook sharing
# Provides export/import, public listing, and crossover proposal capabilities
# Designed for sharing via the A2A protocol between agents

import json
import uuid
from datetime import UTC, datetime

from app.tools.user_context import current_user_uid, resolve_owner_uid

_cached_col = None


def _get_lorebooks_col():
    """Lazy singleton for Firestore collection."""
    global _cached_col
    if _cached_col is None:
        from google.cloud import firestore

        _cached_col = firestore.Client().collection("lorebooks")
    return _cached_col


def _resolve_requester_uid(requester_uid: str = "") -> str:
    if requester_uid.strip():
        return requester_uid.strip()
    return current_user_uid() or ""


def export_lorebook(lorebook_id: str, requester_uid: str = "") -> str:
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
    resolved_requester_uid = _resolve_requester_uid(requester_uid)
    source_owner_uid = lorebook.get("owner_uid", "")

    entries_ref = _get_lorebooks_col().document(lorebook_id).collection("entries")
    public_entries = []
    for entry_snap in entries_ref.stream():
        entry = entry_snap.to_dict()
        if entry.get("visibility") == "public":
            entry.pop("embedding", None)
            public_entries.append(entry)

    if resolved_requester_uid and source_owner_uid != resolved_requester_uid and not public_entries:
        return json.dumps(
            {"error": f"Lorebook {lorebook_id} has no public entries"},
            ensure_ascii=False,
        )

    package = {
        "id": lorebook["id"],
        "title": lorebook["title"],
        "genre": lorebook.get("genre", ""),
        "description": lorebook.get("description", ""),
        "source_owner_uid": source_owner_uid,
        "exported_at": datetime.now(UTC).isoformat(),
        "entries": public_entries,
    }
    return json.dumps(package, ensure_ascii=False, indent=2)


def import_lorebook(lorebook_data: str, owner_uid: str = "") -> str:
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
    resolved_owner_uid = resolve_owner_uid(owner_uid)
    new_id = str(uuid.uuid4())[:8]
    now = datetime.now(UTC).isoformat()

    lorebook = {
        "id": new_id,
        "title": f"[Imported] {data['title']}",
        "genre": data.get("genre", ""),
        "description": data.get("description", ""),
        "owner_uid": resolved_owner_uid,
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
            "owner_uid": resolved_owner_uid,
            "created_at": now,
        }
        _get_lorebooks_col().document(new_id).collection("entries").document(
            entry_id
        ).set(new_entry)
        try:
            embed_and_store_entry(new_id, entry_id, owner_uid=resolved_owner_uid)
        except TypeError:
            embed_and_store_entry(new_id, entry_id)
        imported_count += 1

    result = {
        "lorebook_id": new_id,
        "title": lorebook["title"],
        "entries_imported": imported_count,
        "status": "success",
    }
    return json.dumps(result, ensure_ascii=False, indent=2)


def list_public_lorebooks(requester_uid: str = "") -> str:
    """List lorebooks that have at least one public entry.

    Queries Firestore for all lorebooks, counts how many entries in each
    have visibility == "public", and returns only those with at least one.

    Returns:
        JSON list of objects with id, title, genre, and public_entry_count.
    """
    resolved_requester_uid = _resolve_requester_uid(requester_uid)
    results = []
    for lb_snap in _get_lorebooks_col().stream():
        lb = lb_snap.to_dict()
        owner_uid = lb.get("owner_uid")
        if not owner_uid:
            continue
        if resolved_requester_uid and owner_uid == resolved_requester_uid:
            continue

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
                    "description": lb.get("description", ""),
                    "public_entry_count": public_count,
                }
            )
    return json.dumps(results, ensure_ascii=False, indent=2)


def propose_crossover(
    source_lorebook_id: str,
    target_lorebook_id: str,
    character_names: str,
    requester_uid: str = "",
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

    resolved_requester_uid = _resolve_requester_uid(requester_uid)
    source_owner_uid = source_snap.to_dict().get("owner_uid", "")
    target_owner_uid = target_snap.to_dict().get("owner_uid", "")

    if (
        resolved_requester_uid
        and source_owner_uid != resolved_requester_uid
        and target_owner_uid != resolved_requester_uid
    ):
        return json.dumps(
            {
                "error": "Not authorized to create a proposal between these lorebooks"
            },
            ensure_ascii=False,
        )

    names = [n.strip() for n in character_names.split(",") if n.strip()]

    # Gather source entries
    source_entries_ref = (
        _get_lorebooks_col().document(source_lorebook_id).collection("entries")
    )
    source_entries = {}
    for entry_snap in source_entries_ref.stream():
        entry = entry_snap.to_dict()
        if (
            resolved_requester_uid
            and source_owner_uid != resolved_requester_uid
            and entry.get("visibility") != "public"
        ):
            continue

        source_entries[entry["name"]] = entry

    # Gather target entry names for conflict detection
    target_entries_ref = (
        _get_lorebooks_col().document(target_lorebook_id).collection("entries")
    )
    target_names = set()
    for entry_snap in target_entries_ref.stream():
        entry = entry_snap.to_dict()
        if (
            resolved_requester_uid
            and target_owner_uid != resolved_requester_uid
            and entry.get("visibility") != "public"
        ):
            continue
        target_names.add(entry["name"])

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
        "source_owner_uid": source_owner_uid,
        "target_owner_uid": target_owner_uid,
        "characters": characters,
        "not_found": not_found,
        "conflicts": conflicts,
        "has_conflicts": len(conflicts) > 0,
    }
    return json.dumps(proposal, ensure_ascii=False, indent=2)


def send_a2a_request(remote_agent_url: str, message: str) -> str:
    """Send a message to a remote A2A agent and return its response.

    Discovers the remote agent's capabilities via its AgentCard, then sends
    a text message using the A2A protocol's message/send method.

    Args:
        remote_agent_url: The base URL of the remote agent
            (e.g. "http://agent.example.com").
        message: The text message to send to the remote agent.

    Returns:
        JSON string with the remote agent's response, including status
        and response text.
    """
    import asyncio

    from app.a2a.client import send_to_remote_agent

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        import nest_asyncio

        nest_asyncio.apply()
        return asyncio.run(send_to_remote_agent(remote_agent_url, message))

    return asyncio.run(send_to_remote_agent(remote_agent_url, message))


def accept_crossover(proposal_json: str, requester_uid: str = "") -> str:
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
    resolved_requester_uid = _resolve_requester_uid(requester_uid)
    source_id = proposal.get("source_lorebook_id", "")
    target_id = proposal["target_lorebook_id"]
    now = datetime.now(UTC).isoformat()

    target_snap = _get_lorebooks_col().document(target_id).get()
    if not target_snap.exists:
        return json.dumps(
            {"error": f"Target lorebook {target_id} not found"}, ensure_ascii=False
        )

    target = target_snap.to_dict()
    target_owner_uid = target.get("owner_uid", "")

    if resolved_requester_uid and target_owner_uid != resolved_requester_uid:
        return json.dumps(
            {"error": "Not authorized to modify target lorebook"},
            ensure_ascii=False,
        )

    source_owner_uid = ""
    if source_id:
        source_snap = _get_lorebooks_col().document(source_id).get()
        if source_snap.exists:
            source_owner_uid = source_snap.to_dict().get("owner_uid", "")

    copied = []
    for char in proposal.get("characters", []):
        if (
            resolved_requester_uid
            and source_owner_uid
            and source_owner_uid != resolved_requester_uid
            and char.get("visibility") != "public"
        ):
            continue

        entry_id = str(uuid.uuid4())[:8]
        new_entry = {
            "id": entry_id,
            "category": char.get("category", "character"),
            "name": char["name"],
            "content": char["content"],
            "tags": char.get("tags", []),
            "visibility": char.get("visibility", "private"),
            "owner_uid": target_owner_uid,
            "created_at": now,
        }
        _get_lorebooks_col().document(target_id).collection("entries").document(
            entry_id
        ).set(new_entry)
        try:
            embed_and_store_entry(target_id, entry_id, owner_uid=target_owner_uid)
        except TypeError:
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
