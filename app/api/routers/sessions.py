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
    "alternate_history": (
        "Alternate History — a world where a pivotal historical event went differently, "
        "and the consequences reshaped civilization. No magic or supernatural elements — "
        "the drama comes from plausible divergence: geopolitics, technology, culture. "
        "Tone: grounded, speculative, richly detailed. Think 'what if the Mongol Empire never fell', "
        "'what if the Industrial Revolution started in China', or 'what if Rome never collapsed'. "
        "Every detail must feel historically plausible even though the timeline is fictional."
    ),
    "urban_fantasy": (
        "Urban Fantasy — modern cities hide supernatural undercurrents beneath everyday life. "
        "Vampires run nightclubs, fae courts hold territory in subway tunnels, witches operate "
        "behind ordinary storefronts. Tone: gritty, fast-paced, contemporary. "
        "Think neon-lit alleyways, uneasy truces between human authorities and hidden factions, "
        "and protagonists who straddle both worlds. The mundane and magical collide daily."
    ),
    "cosmic_sci_fi": (
        "Cosmic Sci-Fi — vast interstellar scope spanning star systems, alien civilizations, "
        "and the deep void between worlds. Galactic empires, first-contact dilemmas, "
        "generation ships, and the loneliness of deep space. Tone: awe-inspiring, philosophical, epic. "
        "Think space opera with hard-science grounding: relativistic travel, Dyson spheres, "
        "xenobiology, and the question of humanity's place in a universe teeming with intelligence."
    ),
    "wuxia_xianxia": (
        "Wuxia / Xianxia — a world of martial arts masters, spiritual cultivation, and heaven-defying heroes. "
        "Sects and clans compete for supremacy; cultivation realms define power hierarchies. "
        "Tone: mythic, honor-driven, vertically scaled. Think wandering swordsmen seeking the Dao, "
        "immortal tribulations, forbidden techniques, sect politics, and the tension between "
        "righteous and demonic paths. Power is earned through discipline, sacrifice, and enlightenment."
    ),
    "infinite_flow": (
        "Infinite Flow (無限流) — protagonists are thrust into a succession of deadly, "
        "genre-shifting trial worlds governed by mysterious rules. Survival depends on "
        "wit, teamwork, and uncovering the meta-system behind the trials. "
        "Tone: high-stakes, puzzle-driven, escalating tension. Think death games, "
        "instance dungeons, point-buy systems, hidden NPCs who are actually players, "
        "and a grand conspiracy linking every trial. Power is earned through completed scenarios."
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
    "healer": "The Healer — bound by oath to mend what others break. Compassion is their strength, but they absorb the pain of everyone they save.",
    "sovereign": "The Sovereign — born to rule, burdened by the crown. Every decision costs lives, and the throne is the loneliest seat.",
    "wanderer": "The Wanderer — no home, no roots, only the road ahead. Freedom is their creed, but running from the past catches up eventually.",
    "artificer": "The Artificer — creator of wonders and terrible machines. Innovation drives them, but their inventions often outpace their wisdom.",
    "shadow": "The Shadow — moving unseen, striking from darkness. Precision and silence are their art, but isolation is their constant companion.",
    "rebel": "The Rebel — defying every authority, even destiny itself. Conviction fuels them, but rebellion without purpose becomes destruction.",
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


def _build_conjure_prompt(body: "ConjureRequest", session: dict) -> str:
    """Build a structured, genre-aware conjure prompt from the wizard selections."""

    # --- Step 1: Genre ---
    genre_desc = GENRE_GUIDE.get(
        body.genre, f"Custom genre: {body.genre}. Adapt tone and themes accordingly."
    )

    # --- Step 2: World (Era + Essence) ---
    era_label = body.world_era.replace("_", " ").title()
    essence_descs = []
    for e in body.world_essence:
        desc = ESSENCE_GUIDE.get(e)
        if desc:
            essence_descs.append(f"  - {e.replace('_', ' ').title()}: {desc}")
        else:
            essence_descs.append(f"  - Custom essence: {e}")
    essence_block = (
        "\n".join(essence_descs)
        if essence_descs
        else "  - No specific essence specified."
    )

    # --- Step 3: Protagonists (multi) ---
    protagonists = body.protagonists
    if not protagonists and body.protagonist_archetype:
        # Legacy single-protagonist fallback
        protagonists = [
            ProtagonistConfig(
                archetype=body.protagonist_archetype,
                virtues=body.protagonist_virtues,
                shadow=[body.protagonist_shadow] if body.protagonist_shadow else [],
            )
        ]

    protagonist_blocks = []
    for i, p in enumerate(protagonists, 1):
        archetype_desc = ARCHETYPE_GUIDE.get(
            p.archetype,
            f"Custom archetype: {p.archetype}. Create a unique character concept.",
        )
        virtues_str = ", ".join(
            v.replace("_", " ").title() for v in p.virtues
        )
        shadow_descs = []
        for s in p.shadow:
            sd = SHADOW_GUIDE.get(s, f"Custom shadow/flaw: {s}.")
            shadow_descs.append(sd)
        shadows_str = " | ".join(shadow_descs) if shadow_descs else "No shadow specified."

        label = f"Protagonist {i}" if len(protagonists) > 1 else "Protagonist"
        protagonist_blocks.append(
            f"### {label}\n"
            f"Archetype: {archetype_desc}\n"
            f"Virtues: {virtues_str}\n"
            f"Shadows: {shadows_str}"
        )

    protagonists_section = "\n\n".join(protagonist_blocks)

    # --- Step 4: Spark ---
    spark_block = f'\n## Step 4 — The Spark\n"{body.spark}"' if body.spark else ""

    # --- Title ---
    title_block = f'\n## Story Title\n"{body.title}"' if body.title else ""

    return (
        f"Conjure a new world for story session {session['id']}.\n"
        f"The associated lorebook ID is {session['lorebook_id']}.\n\n"
        f"{title_block}\n"
        f"## Step 1 — Genre\n{genre_desc}\n\n"
        f"## Step 2 — World\n"
        f"Era: {era_label}\n"
        f"Essence:\n{essence_block}\n\n"
        f"## Step 3 — Protagonists\n"
        f"{protagonists_section}\n"
        f"{spark_block}\n\n"
        f"## Story Preferences\n"
        f"Chapter length: {body.chapter_length} "
        f"({'~500 words' if body.chapter_length == 'short' else '~1000 words' if body.chapter_length == 'medium' else '~2000 words'})\n"
        f"Writing style: {body.writing_style}\n\n"
        f"## Task\n"
        f"Create the world, {'all protagonists' if len(protagonists) > 1 else 'protagonist'}, and 2–3 key locations. "
        f"Record EACH entity as a lorebook entry (lorebook ID: {session['lorebook_id']}). "
        f"Match the tone and themes of the genre throughout. "
        f"When generating chapters, use length='{body.chapter_length}' and style='{body.writing_style}'."
    )

router = APIRouter(prefix="/api/sessions", tags=["sessions"])
CurrentUser = Annotated[AuthUser, Depends(get_current_user)]


class ProtagonistConfig(BaseModel):
    archetype: str
    virtues: list[str]
    shadow: list[str]
    custom_archetype: str = ""
    custom_virtues: str = ""
    custom_shadow: str = ""


class ConjureRequest(BaseModel):
    title: str = ""
    genre: str
    world_era: str
    world_essence: list[str]
    protagonists: list[ProtagonistConfig] = []
    # Legacy single-protagonist fields (backward compat)
    protagonist_archetype: str = ""
    protagonist_virtues: list[str] = []
    protagonist_shadow: str = ""
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
        created_at = _as_iso_string(data.get("created_at", ""))
        updated_at = _as_iso_string(data.get("updated_at", ""))
        sessions.append(
            {
                "id": doc.id,
                "title": data.get("title", ""),
                "genre": data.get("genre", ""),
                "world_era": data.get("world_era", ""),
                "world_essence": data.get("world_essence", []),
                "protagonist_archetype": data.get("protagonist_archetype", ""),
                "status": data.get("status", ""),
                "lorebook_id": data.get("lorebook_id", ""),
                "created_at": created_at,
                "updated_at": updated_at,
            }
        )
    sessions.sort(key=lambda x: x.get("updated_at", ""), reverse=True)
    return sessions


@router.get("/examples")
async def list_example_stories(current_user: CurrentUser):
    """List curated example story seeds for onboarding."""
    from app.seeds.example_stories import EXAMPLE_STORIES

    return EXAMPLE_STORIES


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
            db.collection("stories").document(lorebook_id).collection("chapters")
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


@router.delete("/{session_id}")
async def delete_session(
    session_id: str,
    current_user: CurrentUser,
):
    """Delete a story session and its associated data."""
    db = get_firestore_client()
    session = _require_owned_session(db, session_id, current_user.uid)

    lorebook_id = session.get("lorebook_id", "")

    # Delete chapters
    if lorebook_id:
        chapters_ref = (
            db.collection("stories").document(lorebook_id).collection("chapters")
        )
        for ch in chapters_ref.stream():
            ch.reference.delete()
        db.collection("stories").document(lorebook_id).delete()

    # Delete session
    db.collection("story_sessions").document(session_id).delete()

    return {"deleted": session_id}


# --- Type B: Agent-powered via SSE ---


class SuggestTitlesRequest(BaseModel):
    genre: str
    world_era: str
    protagonists: list[dict] = []
    spark: str = ""


@router.post("/suggest-titles")
async def suggest_titles(
    body: SuggestTitlesRequest,
    current_user: CurrentUser,
):
    """Generate AI-suggested story titles based on conjure parameters."""
    from google import genai

    genre_label = body.genre.replace("_", " ").title()
    era_label = body.world_era.replace("_", " ").title()

    protagonist_desc = ""
    for i, p in enumerate(body.protagonists, 1):
        archetype = p.get("archetype", "unknown").replace("_", " ").title()
        protagonist_desc += f"  Protagonist {i}: {archetype}\n"

    prompt = (
        f"Generate exactly 5 creative, evocative story titles for a {genre_label} story "
        f"set in a {era_label} world.\n"
        f"{protagonist_desc}"
        f"{f'Story spark: {body.spark}' if body.spark else ''}\n\n"
        f"Requirements:\n"
        f"- Each title should be 2-6 words\n"
        f"- Titles should feel atmospheric and genre-appropriate\n"
        f"- Return ONLY the titles, one per line, no numbering or extra text"
    )

    client = genai.Client(vertexai=True, project="gemini-hack-487911", location="global")
    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=prompt,
    )
    raw = response.text.strip()
    titles = [line.strip() for line in raw.split("\n") if line.strip()][:5]

    return {"titles": titles}


@router.post("/conjure")
async def conjure_session(
    body: ConjureRequest,
    current_user: CurrentUser,
):
    """Create a new story session and stream the agent's world conjuration via SSE."""
    import json

    from app.api.sse import stream_agent_response
    from app.tools.session_tools import create_session

    # Resolve protagonists
    protagonists_data = []
    if body.protagonists:
        protagonists_data = [
            {"archetype": p.archetype, "virtues": p.virtues, "shadows": p.shadow}
            for p in body.protagonists
        ]
    elif body.protagonist_archetype:
        protagonists_data = [
            {
                "archetype": body.protagonist_archetype,
                "virtues": body.protagonist_virtues,
                "shadows": [body.protagonist_shadow] if body.protagonist_shadow else [],
            }
        ]

    session = json.loads(
        create_session(
            title=body.title,
            genre=body.genre,
            world_era=body.world_era,
            world_essence=body.world_essence,
            protagonists=protagonists_data,
            spark=body.spark,
            owner_uid=current_user.uid,
        )
    )

    # Store preferences in session for subsequent messages
    from app.api.dependencies import get_firestore_client as _get_db

    _get_db().collection("story_sessions").document(session["id"]).update(
        {
            "chapter_length": body.chapter_length,
            "writing_style": body.writing_style,
        }
    )

    conjure_prompt = _build_conjure_prompt(body, session)

    return EventSourceResponse(
        stream_agent_response(
            session_id=session["id"],
            user_message=conjure_prompt,
            user_id=current_user.uid,
        ),
        headers={
            "X-Session-Id": session["id"],
            "X-Lorebook-Id": session["lorebook_id"],
        },
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
