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

# ---------------------------------------------------------------------------
# Genre / Essence / Archetype / Shadow creative direction guides
# These inject tonal and thematic context into the conjure prompt so the agent
# produces genre-appropriate worlds rather than generic fantasy.
# ---------------------------------------------------------------------------

GENRE_GUIDE: dict[str, str] = {
    "dark_fantasy": (
        "Dark Fantasy — a world steeped in dread, moral ambiguity, and forbidden power. "
        "Corruption seeps into institutions; beauty is laced with decay. "
        "Tone: gothic, oppressive, tragic. Think cursed bloodlines, haunted ruins, "
        "bargains with malevolent entities. Violence has weight; hope is scarce but precious."
    ),
    "epic_fantasy": (
        "Epic Fantasy — sweeping scope across kingdoms and ages. "
        "Ancient prophecies, grand battles, deep lore spanning millennia. "
        "Tone: heroic, mythic, layered. Think sprawling empires, sacred oaths, "
        "reluctant heroes carrying the fate of nations. Worldbuilding is rich and detailed."
    ),
    "steampunk": (
        "Steampunk — brass-and-clockwork civilizations powered by steam, alchemy, or aether. "
        "Class divide between industrialists and laborers; invention as both salvation and peril. "
        "Tone: adventurous, inventive, socially aware. Think airship fleets, automaton servants, "
        "underground rebels, and the tension between progress and exploitation."
    ),
    "sci_fi": (
        "Science Fiction — advanced technology shapes society, identity, and conflict. "
        "AI ethics, interstellar politics, post-human evolution, corporate hegemonies. "
        "Tone: speculative, cerebral, awe-inspiring. Think orbital habitats, neural interfaces, "
        "alien first contact, and the question of what it means to be human."
    ),
    "mythic_horror": (
        "Mythic Horror — ancient, unknowable forces lurk beneath the surface of sacred traditions. "
        "Cosmic dread, folklore twisted into nightmare, rituals with real consequences. "
        "Tone: unsettling, atmospheric, slow-burn terror. Think eldritch truths, villages with secrets, "
        "gods that should not be woken, and protagonists who see too much."
    ),
    "historical_arcana": (
        "Historical Arcana — real historical periods with hidden magical undercurrents. "
        "Secret societies, alchemical conspiracies, legendary artifacts woven into known events. "
        "Tone: grounded yet wondrous, intellectually rich. Think Renaissance sorcerers, "
        "Silk Road enchantments, or Victorian occultists. History is the skeleton; magic is the marrow."
    ),
}

ESSENCE_GUIDE: dict[str, str] = {
    "sword_and_sorcery": "Combat and raw magic are central; personal stakes over grand politics.",
    "eldritch_horror": "Unknowable cosmic forces; sanity is fragile; knowledge is dangerous.",
    "political_intrigue": "Power plays, betrayals, alliances; every conversation has a hidden agenda.",
    "survival": "Harsh environments, scarce resources; the world itself is the antagonist.",
    "exploration": "Uncharted territories, ancient ruins, first contact; wonder and discovery drive the plot.",
    "prophecy_and_destiny": "Fate is written but can be defied; chosen ones, oracles, and the weight of foreknowledge.",
}

ARCHETYPE_GUIDE: dict[str, str] = {
    "seer": "The Seer — burdened by visions others cannot bear. Isolated by their gift, compelled to act on what they see.",
    "warrior": "The Warrior — shaped by duty and old scars. Strength is their language, but the cost of violence haunts them.",
    "scholar": "The Scholar — keeper of dangerous and forgotten knowledge. Curiosity is their weapon and their weakness.",
    "trickster": "The Trickster — a smiling force that bends fate sideways. Charm and cunning mask deeper wounds.",
    "outcast": "The Outcast — rejected by the world, chosen by destiny. Their exile becomes their strength.",
}

SHADOW_GUIDE: dict[str, str] = {
    "hubris": "Hubris — an unshakeable belief in their own superiority that blinds them to danger and allies alike.",
    "grief": "Grief — a loss that defines them; they carry the dead with them and struggle to live for the living.",
    "distrust": "Distrust — they cannot rely on anyone; every alliance feels like a trap waiting to spring.",
    "wrath": "Wrath — a fury that burns beneath the surface; when it erupts, it destroys friend and foe alike.",
    "obsession": "Obsession — a singular fixation that consumes everything else; they will sacrifice anything for it.",
    "guilt": "Guilt — they carry a sin they can never atone for; every good deed is an attempt to balance the scales.",
    "isolation": "Isolation — they push everyone away to protect themselves, but loneliness is slowly destroying them.",
    "apathy": "Apathy — they have stopped caring; the world's suffering no longer moves them, and that terrifies those around them.",
}


def _build_conjure_prompt(body: "ConjureRequest", session: dict) -> str:
    """Build a structured, genre-aware conjure prompt from the 4-step wizard selections."""

    # --- Step 1: Genre ---
    genre_desc = GENRE_GUIDE.get(body.genre, f"Custom genre: {body.genre}. Adapt tone and themes accordingly.")

    # --- Step 2: World (Era + Essence) ---
    era_label = body.world_era.replace("_", " ").title()
    essence_descs = []
    for e in body.world_essence:
        desc = ESSENCE_GUIDE.get(e)
        if desc:
            essence_descs.append(f"  - {e.replace('_', ' ').title()}: {desc}")
        else:
            essence_descs.append(f"  - Custom essence: {e}")
    essence_block = "\n".join(essence_descs) if essence_descs else "  - No specific essence specified."

    # --- Step 3: Protagonist ---
    archetype_desc = ARCHETYPE_GUIDE.get(
        body.protagonist_archetype,
        f"Custom archetype: {body.protagonist_archetype}. Create a unique character concept.",
    )
    virtues_str = ", ".join(v.replace("_", " ").title() for v in body.protagonist_virtues)
    shadow_desc = SHADOW_GUIDE.get(
        body.protagonist_shadow,
        f"Custom shadow/flaw: {body.protagonist_shadow}.",
    )

    # --- Step 4: Spark ---
    spark_block = f'\n## Step 4 — The Spark\n"{body.spark}"' if body.spark else ""

    return (
        f"Conjure a new world for story session {session['id']}.\n"
        f"The associated lorebook ID is {session['lorebook_id']}.\n\n"
        f"## Step 1 — Genre\n{genre_desc}\n\n"
        f"## Step 2 — World\n"
        f"Era: {era_label}\n"
        f"Essence:\n{essence_block}\n\n"
        f"## Step 3 — Protagonist\n"
        f"Archetype: {archetype_desc}\n"
        f"Virtues: {virtues_str}\n"
        f"Shadow: {shadow_desc}\n"
        f"{spark_block}\n\n"
        f"## Story Preferences\n"
        f"Chapter length: {body.chapter_length} "
        f"({'~500 words' if body.chapter_length == 'short' else '~1000 words' if body.chapter_length == 'medium' else '~2000 words'})\n"
        f"Writing style: {body.writing_style}\n\n"
        f"## Task\n"
        f"Create the world, protagonist, and 2\u20133 key locations. "
        f"Record EACH entity as a lorebook entry (lorebook ID: {session['lorebook_id']}). "
        f"Match the tone and themes of the genre throughout. "
        f"When generating chapters, use length='{body.chapter_length}' and style='{body.writing_style}'."
    )


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
    chapter_length: str = "medium"
    writing_style: str = "literary fiction"


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
                    "inline_images": ch_data.get("inline_images", []),
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

    # Store preferences in session for subsequent messages
    from app.api.dependencies import get_firestore_client as _get_db
    _get_db().collection("story_sessions").document(session["id"]).update({
        "chapter_length": body.chapter_length,
        "writing_style": body.writing_style,
    })

    conjure_prompt = _build_conjure_prompt(body, session)

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
    session = _require_owned_session(db, session_id, current_user.uid)

    # Prefix the user message with stored preferences so the agent
    # continues to honour length & style across the whole session.
    length = session.get("chapter_length", "medium")
    style = session.get("writing_style", "literary fiction")
    prefixed = (
        f"[Story preferences — chapter length: {length}, writing style: {style}]\n\n"
        f"{body.text}"
    )

    from app.api.sse import stream_agent_response

    return EventSourceResponse(
        stream_agent_response(
            session_id=session_id,
            user_message=prefixed,
            user_id=current_user.uid,
        ),
    )
