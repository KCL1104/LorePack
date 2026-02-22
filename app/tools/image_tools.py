# Image generation tools
# Calls Imagen API to generate character art and scene images, uploads to GCS,
# and stores metadata in Firestore for visual consistency tracking.

import json
import os
from datetime import UTC, datetime

from google.genai import types

from app.tools.user_context import resolve_owner_uid

_cached_genai = None
_cached_col = None
_IMAGE_MODEL = "imagen-4.0-fast-generate-001"


def _is_test_mode() -> bool:
    if os.getenv("PYTEST_CURRENT_TEST"):
        return True
    return os.getenv("LOREPACK_TEST_MODE", "").lower() in {"1", "true", "yes", "on"}


def _image_model() -> str:
    if _is_test_mode():
        return os.getenv(
            "LOREPACK_TEST_IMAGE_MODEL",
            os.getenv("LOREPACK_IMAGE_MODEL", _IMAGE_MODEL),
        )
    return os.getenv("LOREPACK_IMAGE_MODEL", _IMAGE_MODEL)


def _image_config() -> types.GenerateImagesConfig:
    config_kwargs: dict[str, object] = {
        "number_of_images": 1,
        "output_mime_type": "image/png",
    }
    if _is_test_mode():
        config_kwargs["enhance_prompt"] = False
        image_size = os.getenv("LOREPACK_TEST_IMAGE_SIZE", "")
        if image_size:
            config_kwargs["image_size"] = image_size
    return types.GenerateImagesConfig(**config_kwargs)


def _get_genai_client():
    """Lazy singleton for genai client."""
    global _cached_genai
    if _cached_genai is None:
        from google import genai

        _cached_genai = genai.Client(
            vertexai=True, project="gemini-hack-487911", location="us-central1"
        )
    return _cached_genai


def _get_image_assets_col():
    """Lazy singleton for Firestore collection."""
    global _cached_col
    if _cached_col is None:
        from google.cloud import firestore

        _cached_col = firestore.Client().collection("image_assets")
    return _cached_col


def generate_character_image(
    character_name: str,
    appearance_description: str,
    art_style: str = "anime illustration",
    pose: str = "portrait",
    lorebook_id: str = "",
    owner_uid: str = "",
) -> str:
    """Generate character art based on an appearance description.

    Args:
        character_name: Character name, used for file naming and asset management.
        appearance_description: Detailed appearance description (hair color, eye color, outfit, etc.).
        art_style: Art style preference, e.g. "anime illustration", "realistic", "watercolor".
        pose: Pose type, e.g. "portrait" (half-body), "full_body", "action".

    Returns:
        JSON string containing generation result metadata including gs_uri and prompt_used.
    """
    from app.tools.gcs_tools import upload_image

    resolved_owner_uid = resolve_owner_uid(owner_uid)

    prompt = f"{art_style}, {pose} of {character_name}: {appearance_description}"
    safe_name = character_name.lower().replace(" ", "_")
    gcs_path = f"characters/{safe_name}.png"

    client = _get_genai_client()
    response = client.models.generate_images(
        model=_image_model(),
        prompt=prompt,
        config=_image_config(),
    )
    image_bytes = response.generated_images[0].image.image_bytes

    gs_uri = upload_image(image_bytes, gcs_path)
    now = datetime.now(UTC).isoformat()

    metadata = {
        "status": "success",
        "character_name": character_name,
        "asset_type": "character",
        "prompt_used": prompt,
        "gs_uri": gs_uri,
        "lorebook_id": lorebook_id,
        "owner_uid": resolved_owner_uid,
        "art_style": art_style,
        "pose": pose,
        "generated_at": now,
    }
    _get_image_assets_col().add(metadata)

    return json.dumps(metadata, ensure_ascii=False, indent=2)


def generate_scene_image(
    scene_name: str,
    scene_description: str,
    art_style: str = "concept art",
    mood: str = "neutral",
    lorebook_id: str = "",
    owner_uid: str = "",
) -> str:
    """Generate a scene concept image based on a scene description.

    Args:
        scene_name: Scene name, used for file naming.
        scene_description: Detailed scene description (environment, lighting, atmosphere, etc.).
        art_style: Art style preference, e.g. "concept art", "photorealistic", "fantasy painting".
        mood: Scene mood, e.g. "peaceful", "ominous", "epic", "mysterious".

    Returns:
        JSON string containing generation result metadata including gs_uri and prompt_used.
    """
    from app.tools.gcs_tools import upload_image

    resolved_owner_uid = resolve_owner_uid(owner_uid)

    prompt = f"{art_style}, {mood} mood: {scene_description}"
    safe_name = scene_name.lower().replace(" ", "_")
    gcs_path = f"scenes/{safe_name}.png"

    client = _get_genai_client()
    response = client.models.generate_images(
        model=_image_model(),
        prompt=prompt,
        config=_image_config(),
    )
    image_bytes = response.generated_images[0].image.image_bytes

    gs_uri = upload_image(image_bytes, gcs_path)
    now = datetime.now(UTC).isoformat()

    metadata = {
        "status": "success",
        "scene_name": scene_name,
        "asset_type": "scene",
        "prompt_used": prompt,
        "gs_uri": gs_uri,
        "lorebook_id": lorebook_id,
        "owner_uid": resolved_owner_uid,
        "art_style": art_style,
        "mood": mood,
        "generated_at": now,
    }
    _get_image_assets_col().add(metadata)

    return json.dumps(metadata, ensure_ascii=False, indent=2)


def get_character_visual_history(character_name: str, owner_uid: str = "") -> str:
    """Query past image generations for a character to maintain visual consistency.

    Args:
        character_name: Character name to look up.

    Returns:
        JSON string containing a list of past generations with prompts and URIs.
    """
    resolved_owner_uid = resolve_owner_uid(owner_uid)
    query = _get_image_assets_col().where("character_name", "==", character_name)
    query = query.where("owner_uid", "==", resolved_owner_uid)
    history = []
    for doc in query.stream():
        d = doc.to_dict()
        history.append(
            {
                "doc_id": doc.id,
                "prompt_used": d.get("prompt_used", ""),
                "gs_uri": d.get("gs_uri", ""),
                "art_style": d.get("art_style", ""),
                "pose": d.get("pose", ""),
                "generated_at": d.get("generated_at", ""),
            }
        )
    history.sort(key=lambda x: x.get("generated_at", ""))
    return json.dumps(history, ensure_ascii=False, indent=2)
