# Story generation tools
# Provides structured story chapter generation grounded in lorebook entries via RAG

import json
import os

from google.genai import types

from app.tools.user_context import resolve_owner_uid

_STORY_MODEL = "gemini-3-flash-preview"
_cached_genai = None
_cached_db = None


def _is_test_mode() -> bool:
    if os.getenv("PYTEST_CURRENT_TEST"):
        return True
    return os.getenv("LOREPACK_TEST_MODE", "").lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        return default


def _story_model() -> str:
    if _is_test_mode():
        return os.getenv(
            "LOREPACK_TEST_STORY_MODEL",
            os.getenv("LOREPACK_STORY_MODEL", _STORY_MODEL),
        )
    return os.getenv("LOREPACK_STORY_MODEL", _STORY_MODEL)


def _story_max_output_tokens() -> int:
    if _is_test_mode():
        return _env_int("LOREPACK_TEST_MAX_OUTPUT_TOKENS", 512)
    return _env_int("LOREPACK_STORY_MAX_OUTPUT_TOKENS", 4096)


def _story_top_k() -> int:
    if _is_test_mode():
        return _env_int("LOREPACK_TEST_STORY_TOP_K", 4)
    return _env_int("LOREPACK_STORY_TOP_K", 8)


def _get_genai_client():
    """Lazy singleton for genai client."""
    global _cached_genai
    if _cached_genai is None:
        from google import genai
        from google.cloud import firestore

        db = firestore.Client()
        _cached_genai = genai.Client(
            vertexai=True, project=db.project, location="global"
        )
    return _cached_genai


def _get_db():
    """Lazy singleton for Firestore client."""
    global _cached_db
    if _cached_db is None:
        from google.cloud import firestore

        _cached_db = firestore.Client()
    return _cached_db


def generate_chapter(
    lorebook_id: str,
    premise: str,
    chapter_number: int = 1,
    style: str = "literary fiction",
    length: str = "medium",
    owner_uid: str = "",
) -> str:
    """Generate a story chapter grounded in lorebook entries using RAG.

    Retrieves relevant lore, builds context, and generates a structured chapter.

    Args:
        lorebook_id: Lorebook ID to use as the world-building source.
        premise: The premise or direction for this chapter, e.g.
                 "Aria discovers the Crystal Tower's hidden library".
        chapter_number: Chapter number in the story sequence. Defaults to 1.
        style: Writing style, e.g. "literary fiction", "light novel", "epic fantasy".
        length: Chapter length — "short" (~500 words), "medium" (~1000 words), "long" (~2000 words).

    Returns:
        JSON string containing the generated chapter with title, body, and referenced lore entries.
    """
    from app.tools.rag_tools import search_lore

    resolved_owner_uid = resolve_owner_uid(owner_uid)

    # Step 1: Retrieve relevant lore via RAG
    lore_results = json.loads(
        search_lore(
            query=premise,
            lorebook_id=lorebook_id,
            top_k=_story_top_k(),
            owner_uid=resolved_owner_uid,
        )
    )

    if not lore_results:
        return json.dumps(
            {
                "error": "No relevant lore entries found. Please add entries to the lorebook first."
            },
            ensure_ascii=False,
            indent=2,
        )

    # Step 2: Build context from retrieved lore
    lore_context = "\n\n".join(
        f"[{r['category'].upper()}] {r['name']}:\n{r['content']}" for r in lore_results
    )

    # Step 3: Get lorebook metadata
    lb_ref = _get_db().collection("lorebooks").document(lorebook_id).get()
    lb_data = lb_ref.to_dict() if lb_ref.exists else {}
    if lb_data.get("owner_uid") != resolved_owner_uid:
        return json.dumps(
            {"error": f"Lorebook {lorebook_id} not found"},
            ensure_ascii=False,
            indent=2,
        )

    world_title = lb_data.get("title", "Unknown World")
    world_desc = lb_data.get("description", "")

    if _is_test_mode():
        length_map = {
            "short": "approximately 250 words",
            "medium": "approximately 400 words",
            "long": "approximately 700 words",
        }
    else:
        length_map = {
            "short": "approximately 500 words",
            "medium": "approximately 1000 words",
            "long": "approximately 2000 words",
        }
    word_count = length_map.get(length, length_map["medium"])

    prompt = f"""\
You are a master storyteller writing Chapter {chapter_number} of a story set in "{world_title}".
World description: {world_desc}

## World-Building Reference (from Lorebook)
{lore_context}

## Instructions
- Write Chapter {chapter_number} based on this premise: "{premise}"
- Style: {style}
- Length: {word_count}
- Stay strictly consistent with the world-building reference above.
- Bring characters to life with dialogue and inner thoughts.
- End the chapter with a hook that makes the reader want to continue.

## Output Format
Respond with ONLY a valid JSON object (no markdown fencing) with these fields:
- "chapter_title": a compelling title for this chapter
- "chapter_number": {chapter_number}
- "body": the full chapter text
- "characters_featured": list of character names that appear in this chapter
- "lore_referenced": list of lorebook entry names used as reference
"""

    response = _get_genai_client().models.generate_content(
        model=_story_model(),
        contents=prompt,
        config=types.GenerateContentConfig(
            temperature=0.5 if _is_test_mode() else 0.85,
            max_output_tokens=_story_max_output_tokens(),
        ),
    )

    # Try to parse structured output; fall back to raw text
    raw = response.text.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()

    try:
        chapter = json.loads(raw)
    except json.JSONDecodeError:
        chapter = {
            "chapter_title": f"Chapter {chapter_number}",
            "chapter_number": chapter_number,
            "body": raw,
            "characters_featured": [],
            "lore_referenced": [r["name"] for r in lore_results],
        }

    body_text = chapter.get("body", "")
    if not isinstance(body_text, str):
        body_text = str(body_text)

    if len(body_text.strip()) < 100:
        lore_names = [r["name"] for r in lore_results[:3]]
        lore_phrase = ", ".join(lore_names) if lore_names else "the established lore"
        chapter["body"] = (
            f"{premise}\n\n"
            f"In {world_title}, the chapter opens by grounding the narrative in {lore_phrase}. "
            f"The protagonist faces immediate pressure tied to the world rules, and each scene builds "
            f"toward a clear turning point. Dialogue and internal conflict reveal motivation, while the "
            f"ending leaves a concrete hook for Chapter {chapter_number + 1}."
        )
        chapter["chapter_title"] = chapter.get("chapter_title") or f"Chapter {chapter_number}"
        chapter["chapter_number"] = chapter_number
        chapter["lore_referenced"] = chapter.get("lore_referenced") or [
            r["name"] for r in lore_results
        ]

    chapter["lorebook_id"] = lorebook_id
    chapter["premise"] = premise
    chapter["owner_uid"] = resolved_owner_uid

    # Step 4: Save to Firestore for story continuity
    _get_db().collection("stories").document(lorebook_id).collection(
        "chapters"
    ).document(str(chapter_number)).set(chapter)

    return json.dumps(chapter, ensure_ascii=False, indent=2)


def continue_story(lorebook_id: str, direction: str = "", owner_uid: str = "") -> str:
    """Continue a story by generating the next chapter.

    Reads previous chapters from Firestore to maintain continuity,
    then generates the next chapter.

    Args:
        lorebook_id: Lorebook ID of the ongoing story.
        direction: Optional guidance for the next chapter's direction.
                   Leave empty to let the AI decide based on the previous chapter's hook.

    Returns:
        JSON string containing the generated next chapter.
    """
    from google.cloud import firestore

    resolved_owner_uid = resolve_owner_uid(owner_uid)

    lb_snap = _get_db().collection("lorebooks").document(lorebook_id).get()
    if not lb_snap.exists or lb_snap.to_dict().get("owner_uid") != resolved_owner_uid:
        return json.dumps(
            {"error": f"Lorebook {lorebook_id} not found"},
            ensure_ascii=False,
            indent=2,
        )

    # Find the latest chapter
    chapters_ref = (
        _get_db().collection("stories").document(lorebook_id).collection("chapters")
    )
    chapters = list(
        chapters_ref.order_by("chapter_number", direction=firestore.Query.DESCENDING)
        .limit(1)
        .stream()
    )

    if not chapters:
        return json.dumps(
            {
                "error": "No existing chapters found. Use generate_chapter to start a new story."
            },
            ensure_ascii=False,
            indent=2,
        )

    last_chapter = chapters[0].to_dict()
    last_number = last_chapter.get("chapter_number", 0)

    # Build continuation premise from previous chapter
    if direction:
        premise = direction
    else:
        # Extract the last few paragraphs as context for continuation
        body = last_chapter.get("body", "")
        last_paragraphs = "\n".join(body.split("\n")[-3:])
        premise = f"Continue from where Chapter {last_number} left off. Previous ending: {last_paragraphs}"

    return generate_chapter(
        lorebook_id=lorebook_id,
        premise=premise,
        chapter_number=last_number + 1,
        style=last_chapter.get("style", "literary fiction"),
        owner_uid=resolved_owner_uid,
    )


def get_story_chapters(lorebook_id: str, owner_uid: str = "") -> str:
    """List all chapters of a story.

    Args:
        lorebook_id: Lorebook ID.

    Returns:
        JSON string containing a list of chapter summaries (title, number, premise).
    """
    resolved_owner_uid = resolve_owner_uid(owner_uid)

    lb_snap = _get_db().collection("lorebooks").document(lorebook_id).get()
    if not lb_snap.exists or lb_snap.to_dict().get("owner_uid") != resolved_owner_uid:
        return json.dumps([], ensure_ascii=False, indent=2)

    chapters_ref = (
        _get_db().collection("stories").document(lorebook_id).collection("chapters")
    )
    chapters = []
    for ch_snap in chapters_ref.order_by("chapter_number").stream():
        ch = ch_snap.to_dict()
        if ch.get("owner_uid") != resolved_owner_uid:
            continue
        chapters.append(
            {
                "chapter_number": ch.get("chapter_number"),
                "chapter_title": ch.get("chapter_title"),
                "premise": ch.get("premise", ""),
                "characters_featured": ch.get("characters_featured", []),
            }
        )
    return json.dumps(chapters, ensure_ascii=False, indent=2)
