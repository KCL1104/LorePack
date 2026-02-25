# Story generation tools
# Provides structured story chapter generation grounded in lorebook entries via RAG.
# Uses Gemini's interleaved (mixed) output to generate narrative text with
# inline scene illustrations in a single model call.

import json
import os
from datetime import UTC, datetime

from google.genai import types

from app.tools.user_context import resolve_owner_uid

_STORY_MODEL = "gemini-3-flash-preview"


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
    return _env_int("LOREPACK_STORY_MAX_OUTPUT_TOKENS", 8192)


def _story_top_k() -> int:
    if _is_test_mode():
        return _env_int("LOREPACK_TEST_STORY_TOP_K", 4)
    return _env_int("LOREPACK_STORY_TOP_K", 8)


def _get_genai_client():
    from app.tools._firestore import get_genai_client

    return get_genai_client()


def _get_db():
    from app.tools._firestore import get_db

    return get_db()


def _build_lore_context(lore_results: list[dict]) -> str:
    """Format retrieved lore entries into a prompt context block."""
    return "\n\n".join(
        f"[{r['category'].upper()}] {r['name']}:\n{r['content']}" for r in lore_results
    )


def _parse_interleaved_response(
    response,
    lorebook_id: str,
    chapter_number: int,
    premise: str,
    owner_uid: str,
) -> tuple[str, str, list[dict]]:
    """Parse a Gemini interleaved (text + image) response.

    Returns (chapter_title, body, inline_images).
    """
    from app.tools.gcs_tools import upload_image

    body_segments: list[str] = []
    inline_images: list[dict] = []
    now = datetime.now(UTC).isoformat()

    for part in response.candidates[0].content.parts:
        if part.text:
            body_segments.append(part.text)
        elif part.inline_data and part.inline_data.data:
            img_idx = len(inline_images)
            gcs_path = (
                f"stories/{owner_uid}/{lorebook_id}/ch{chapter_number}_{img_idx}.png"
            )
            gs_uri = upload_image(part.inline_data.data, gcs_path)

            inline_images.append(
                {
                    "index": img_idx,
                    "gs_uri": gs_uri,
                    "mime_type": part.inline_data.mime_type or "image/png",
                    "position": len(body_segments),
                }
            )
            body_segments.append(f"\n\n[illustration:{img_idx}]\n\n")

    body = "".join(body_segments)

    # Extract chapter title from the first "# ..." line
    chapter_title = f"Chapter {chapter_number}"
    lines = body.split("\n")
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith("# "):
            chapter_title = stripped[2:].strip()
            lines.pop(i)
            body = "\n".join(lines).strip()
            break

    # Persist image metadata to the gallery
    if inline_images:
        image_col = _get_db().collection("image_assets")
        for img in inline_images:
            image_col.add(
                {
                    "status": "success",
                    "asset_type": "scene",
                    "scene_name": (
                        f"{chapter_title} — Illustration {img['index'] + 1}"
                    ),
                    "prompt_used": f"Interleaved illustration for: {premise}",
                    "gs_uri": img["gs_uri"],
                    "lorebook_id": lorebook_id,
                    "owner_uid": owner_uid,
                    "art_style": "interleaved",
                    "generated_at": now,
                }
            )

    return chapter_title, body, inline_images


def _parse_text_only_response(
    response,
    chapter_number: int,
    lore_results: list[dict],
    world_title: str,
    premise: str,
) -> dict:
    """Parse a text-only JSON response (used in test mode)."""
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
            f"In {world_title}, the chapter opens by grounding the narrative "
            f"in {lore_phrase}. The protagonist faces immediate pressure tied "
            f"to the world rules, and each scene builds toward a clear turning "
            f"point. Dialogue and internal conflict reveal motivation, while "
            f"the ending leaves a concrete hook for "
            f"Chapter {chapter_number + 1}."
        )
        chapter["chapter_title"] = (
            chapter.get("chapter_title") or f"Chapter {chapter_number}"
        )
        chapter["chapter_number"] = chapter_number
        chapter["lore_referenced"] = chapter.get("lore_referenced") or [
            r["name"] for r in lore_results
        ]

    return chapter


def generate_chapter(
    lorebook_id: str,
    premise: str,
    chapter_number: int = 1,
    style: str = "literary fiction",
    length: str = "medium",
    owner_uid: str = "",
) -> str:
    """Generate a story chapter grounded in lorebook entries using RAG.

    In production mode, uses Gemini's interleaved (mixed) output to generate
    narrative prose with inline scene illustrations in a single model call.
    Images are automatically uploaded to GCS and recorded in the gallery.

    Args:
        lorebook_id: Lorebook ID to use as the world-building source.
        premise: The premise or direction for this chapter, e.g.
                 "Aria discovers the Crystal Tower's hidden library".
        chapter_number: Chapter number in the story sequence. Defaults to 1.
        style: Writing style, e.g. "literary fiction", "light novel", "epic fantasy".
        length: Chapter length — "short" (~500 words), "medium" (~1000 words), "long" (~2000 words).

    Returns:
        JSON string containing the generated chapter with title, body,
        referenced lore entries, and inline_images (GCS URIs).
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
                "error": "No relevant lore entries found. "
                "Please add entries to the lorebook first."
            },
            ensure_ascii=False,
            indent=2,
        )

    lore_context = _build_lore_context(lore_results)

    # Step 2: Get lorebook metadata
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

    # Step 3: Call Gemini — interleaved text+image in production, text-only in tests
    use_interleaved = not _is_test_mode()

    if use_interleaved:
        prompt = (
            f"You are a master storyteller and illustrator creating "
            f'Chapter {chapter_number} of a story set in "{world_title}".\n'
            f"World description: {world_desc}\n\n"
            f"## World-Building Reference (from Lorebook)\n{lore_context}\n\n"
            f"## Instructions\n"
            f'- Write Chapter {chapter_number} based on this premise: "{premise}"\n'
            f"- Style: {style}\n"
            f"- Length: {word_count}\n"
            f"- Stay strictly consistent with the world-building reference above.\n"
            f"- Bring characters to life with dialogue and inner thoughts.\n"
            f"- End the chapter with a hook that makes the reader want to continue.\n"
            f'- Start your response with "# " followed by a compelling chapter title.\n'
            f"- Generate 1-2 vivid scene illustrations at key dramatic moments.\n"
            f"  Place images naturally between paragraphs at impactful story beats.\n"
            f"- Illustrations must NOT contain any text, watermarks, or signatures.\n"
        )
        config = types.GenerateContentConfig(
            temperature=0.85,
            max_output_tokens=_story_max_output_tokens(),
            response_modalities=["TEXT", "IMAGE"],
            thinking_config=types.ThinkingConfig(
                thinking_level=types.ThinkingLevel.LOW,
            ),
        )
    else:
        prompt = (
            f"You are a master storyteller writing "
            f'Chapter {chapter_number} of a story set in "{world_title}".\n'
            f"World description: {world_desc}\n\n"
            f"## World-Building Reference (from Lorebook)\n{lore_context}\n\n"
            f"## Instructions\n"
            f'- Write Chapter {chapter_number} based on this premise: "{premise}"\n'
            f"- Style: {style}\n"
            f"- Length: {word_count}\n"
            f"- Stay strictly consistent with the world-building reference above.\n"
            f"- Bring characters to life with dialogue and inner thoughts.\n"
            f"- End the chapter with a hook that makes the reader want to continue.\n\n"
            f"## Output Format\n"
            f"Respond with ONLY a valid JSON object (no markdown fencing) with these fields:\n"
            f'- "chapter_title": a compelling title for this chapter\n'
            f'- "chapter_number": {chapter_number}\n'
            f'- "body": the full chapter text\n'
            f'- "characters_featured": list of character names that appear\n'
            f'- "lore_referenced": list of lorebook entry names used as reference\n'
        )
        config = types.GenerateContentConfig(
            temperature=0.5,
            max_output_tokens=_story_max_output_tokens(),
            thinking_config=types.ThinkingConfig(
                thinking_level=types.ThinkingLevel.LOW,
            ),
        )

    response = _get_genai_client().models.generate_content(
        model=_story_model(),
        contents=prompt,
        config=config,
    )

    # Step 4: Parse response
    if use_interleaved:
        chapter_title, body, inline_images = _parse_interleaved_response(
            response,
            lorebook_id=lorebook_id,
            chapter_number=chapter_number,
            premise=premise,
            owner_uid=resolved_owner_uid,
        )
        chapter = {
            "chapter_title": chapter_title,
            "chapter_number": chapter_number,
            "body": body,
            "characters_featured": [],
            "lore_referenced": [r["name"] for r in lore_results],
            "inline_images": inline_images,
        }
    else:
        chapter = _parse_text_only_response(
            response,
            chapter_number=chapter_number,
            lore_results=lore_results,
            world_title=world_title,
            premise=premise,
        )

    chapter["lorebook_id"] = lorebook_id
    chapter["premise"] = premise
    chapter["style"] = style
    chapter["length"] = length
    chapter["owner_uid"] = resolved_owner_uid

    # Step 5: Save to Firestore for story continuity
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

    # Gather arc context from all previous chapters (titles + premises)
    all_chapters = list(chapters_ref.order_by("chapter_number").stream())
    arc_lines: list[str] = []
    for ch_snap in all_chapters:
        ch = ch_snap.to_dict()
        ch_num = ch.get("chapter_number", "?")
        ch_title = ch.get("chapter_title", f"Chapter {ch_num}")
        ch_premise = ch.get("premise", "")
        arc_lines.append(f"  Ch{ch_num}: {ch_title} — {ch_premise}")
    arc_summary = "\n".join(arc_lines[-6:])  # last 6 chapters max

    # Build continuation premise with full arc context
    body = last_chapter.get("body", "")
    last_paragraphs = "\n".join(body.split("\n")[-3:])
    base_context = (
        f"## Story Arc So Far\n{arc_summary}\n\n"
        f"## Previous Chapter Ending (Chapter {last_number})\n{last_paragraphs}"
    )

    if direction:
        premise = f"{base_context}\n\n## Direction for Next Chapter\n{direction}"
    else:
        premise = f"{base_context}\n\nContinue naturally from where Chapter {last_number} left off."

    return generate_chapter(
        lorebook_id=lorebook_id,
        premise=premise,
        chapter_number=last_number + 1,
        style=last_chapter.get("style", "literary fiction"),
        length=last_chapter.get("length", "medium"),
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
