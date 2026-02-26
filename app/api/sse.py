"""SSE helpers for streaming agent responses to the frontend.

Handles both text and interleaved image data from Gemini's mixed output.
"""

import json
import logging
from collections.abc import AsyncGenerator

from google.adk.artifacts import InMemoryArtifactService
from google.adk.runners import Runner
from google.genai import types as genai_types

from app.app_utils.session_service import get_session_service
from app.tools.user_context import scoped_user

_logger = logging.getLogger("lorepack.sse")


def sse_event(event_type: str, data: dict) -> str:
    """Format an SSE event string."""
    payload = json.dumps({"type": event_type, **data}, ensure_ascii=False)
    return f"data: {payload}\n\n"


_session_service = get_session_service(logger=_logger)
_artifact_service = InMemoryArtifactService()
_runner: Runner | None = None


def _get_runner() -> Runner:
    """Lazy singleton for the ADK Runner."""
    global _runner
    if _runner is None:
        from app.agent import app as adk_app

        _runner = Runner(
            app=adk_app,
            session_service=_session_service,
            artifact_service=_artifact_service,
        )
    return _runner


def _extract_inline_images(text: str) -> list[dict]:
    """Try to extract inline_images from a JSON function response."""
    try:
        data = json.loads(text)
        return data.get("inline_images", [])
    except (json.JSONDecodeError, AttributeError, TypeError):
        return []


async def stream_agent_response(
    session_id: str,
    user_message: str,
    user_id: str = "frontend-user",
) -> AsyncGenerator[str]:
    """Run the agent and yield SSE events for the frontend.

    Yields events:
      - thinking: status updates
      - text_chunk: incremental text from the agent
      - image_generated: inline image from interleaved output (gs_uri)
      - lorebook_updated: when the agent auto-creates a lorebook entry
      - lore_cited: when search_lore returns matching lorebook entries
      - done: final completion signal
    """
    runner = _get_runner()

    with scoped_user(user_id):
        # Ensure session exists
        session = await _session_service.get_session(
            app_name=runner.app.name,
            user_id=user_id,
            session_id=session_id,
        )
        if session is None:
            session = await _session_service.create_session(
                app_name=runner.app.name,
                user_id=user_id,
                session_id=session_id,
            )

        yield sse_event("thinking", {"text": "Processing your request..."})

        content = genai_types.Content(
            role="user",
            parts=[genai_types.Part(text=user_message)],
        )

        full_text = ""
        try:
            async for event in runner.run_async(
                session_id=session.id,
                user_id=user_id,
                new_message=content,
            ):
                if not event.content or not event.content.parts:
                    continue

                for part in event.content.parts:
                    # --- Text ---
                    if part.text:
                        full_text += part.text
                        yield sse_event("text_chunk", {"text": part.text})

                    # --- Inline image from interleaved output ---
                    if (
                        hasattr(part, "inline_data")
                        and part.inline_data
                        and part.inline_data.data
                    ):
                        from app.tools.gcs_tools import upload_image

                        gs_uri = upload_image(
                            part.inline_data.data,
                            f"sse/{session_id}/{id(part)}.png",
                        )
                        yield sse_event(
                            "image_generated",
                            {
                                "gs_uri": gs_uri,
                                "mime_type": part.inline_data.mime_type or "image/png",
                            },
                        )

                    # --- Function calls (agent calling a tool) ---
                    if part.function_call:
                        tool_name = part.function_call.name
                        tool_args = (
                            dict(part.function_call.args)
                            if part.function_call.args
                            else {}
                        )
                        if tool_name == "add_lorebook_entry":
                            yield sse_event(
                                "lorebook_updated",
                                {
                                    "entry_name": tool_args.get("name", ""),
                                    "category": tool_args.get("category", ""),
                                },
                            )
                        elif tool_name == "generate_chapter":
                            yield sse_event(
                                "thinking",
                                {"text": "Writing chapter text…"},
                            )
                        elif tool_name == "search_lore":
                            yield sse_event(
                                "thinking",
                                {"text": "Searching lorebook for relevant lore..."},
                            )
                        elif tool_name == "get_lorebook":
                            yield sse_event(
                                "thinking",
                                {"text": "Reading lorebook entries..."},
                            )
                        elif tool_name == "validate_lorebook_consistency":
                            yield sse_event(
                                "thinking",
                                {"text": "Validating lorebook consistency..."},
                            )
                        elif tool_name == "update_session_status":
                            yield sse_event(
                                "thinking",
                                {
                                    "text": f"Session status → {tool_args.get('status', '')}"
                                },
                            )
                        elif tool_name == "generate_character_image":
                            yield sse_event(
                                "thinking",
                                {
                                    "text": f"Generating portrait for {tool_args.get('character_name', 'character')}..."
                                },
                            )
                        elif tool_name == "generate_scene_image":
                            yield sse_event(
                                "thinking",
                                {
                                    "text": f"Generating scene: {tool_args.get('scene_name', 'scene')}..."
                                },
                            )

                    # --- Function responses (tool results) ---
                    if part.function_response:
                        fn_name = getattr(part.function_response, "name", "")
                        if fn_name == "generate_chapter":
                            result_obj = part.function_response.response
                            raw_result = (
                                result_obj.get("result", "")
                                if isinstance(result_obj, dict)
                                else str(result_obj)
                            )

                            # Check for deferred illustration prompts
                            try:
                                chapter_data = (
                                    json.loads(raw_result)
                                    if isinstance(raw_result, str)
                                    else raw_result
                                )
                            except (json.JSONDecodeError, TypeError):
                                chapter_data = {}

                            pending_illustrations = []
                            if isinstance(chapter_data, dict):
                                for img in chapter_data.get("inline_images", []):
                                    if img.get("illustration_prompt") and not img.get("gs_uri"):
                                        pending_illustrations.append(img)

                            if pending_illustrations:
                                import asyncio

                                from app.tools.story_tools import generate_illustration

                                total = len(pending_illustrations)
                                lorebook_id = chapter_data.get("lorebook_id", "")
                                ch_number = chapter_data.get("chapter_number", 1)
                                ch_title = chapter_data.get("chapter_title", "")
                                ch_premise = chapter_data.get("premise", "")
                                ch_owner = chapter_data.get("owner_uid", user_id)

                                for i, img in enumerate(pending_illustrations):
                                    yield sse_event(
                                        "thinking",
                                        {
                                            "text": f"Generating illustration {i + 1}/{total} via Imagen…"
                                        },
                                    )
                                    result = await asyncio.to_thread(
                                        generate_illustration,
                                        illustration_prompt=img["illustration_prompt"],
                                        lorebook_id=lorebook_id,
                                        chapter_number=ch_number,
                                        img_index=img.get("index", i),
                                        owner_uid=ch_owner,
                                        chapter_title=ch_title,
                                        premise=ch_premise,
                                    )
                                    if result.get("gs_uri"):
                                        yield sse_event(
                                            "image_generated",
                                            {
                                                "gs_uri": result["gs_uri"],
                                                "index": result.get("index", i),
                                            },
                                        )
                                yield sse_event(
                                    "thinking",
                                    {"text": "Illustrations complete."},
                                )
                            else:
                                # Legacy: images already generated in tool
                                for img in _extract_inline_images(raw_result):
                                    yield sse_event(
                                        "image_generated",
                                        {
                                            "gs_uri": img.get("gs_uri", ""),
                                            "index": img.get("index", 0),
                                        },
                                    )
                        elif fn_name in (
                            "generate_character_image",
                            "generate_scene_image",
                        ):
                            result_obj = part.function_response.response
                            raw_result = (
                                result_obj.get("result", "")
                                if isinstance(result_obj, dict)
                                else str(result_obj)
                            )
                            try:
                                img_data = (
                                    json.loads(raw_result)
                                    if isinstance(raw_result, str)
                                    else raw_result
                                )
                                if isinstance(img_data, dict) and img_data.get(
                                    "gs_uri"
                                ):
                                    yield sse_event(
                                        "image_generated",
                                        {
                                            "gs_uri": img_data["gs_uri"],
                                            "mime_type": "image/png",
                                        },
                                    )
                            except (json.JSONDecodeError, TypeError):
                                pass
                        elif fn_name == "search_lore":
                            result_obj = part.function_response.response
                            raw_result = (
                                result_obj.get("result", "")
                                if isinstance(result_obj, dict)
                                else str(result_obj)
                            )
                            try:
                                entries = (
                                    json.loads(raw_result)
                                    if isinstance(raw_result, str)
                                    else raw_result
                                )
                                if isinstance(entries, list):
                                    entry_names = [
                                        e.get("name", "")
                                        for e in entries
                                        if e.get("name")
                                    ]
                                    if entry_names:
                                        yield sse_event(
                                            "lore_cited", {"entries": entry_names}
                                        )
                            except (json.JSONDecodeError, TypeError):
                                pass
        except Exception as exc:
            _logger.exception("Agent stream error session=%s: %s", session_id, exc)
            yield sse_event(
                "error",
                {"message": f"Agent error: {exc}", "retryable": True},
            )

    yield sse_event("done", {"full_text": full_text})
