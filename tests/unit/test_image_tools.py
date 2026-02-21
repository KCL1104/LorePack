"""Unit tests for image generation tools against live Imagen API, GCS, and Firestore."""

import json

import pytest

from app.tools.image_tools import (
    generate_character_image,
    get_character_visual_history,
)

_BUCKET_NAME = "lorepack-assets-gemini-hack"
_TEST_CHARACTER = "TestHero_ImgUnit"


@pytest.fixture(scope="module")
def character_result():
    """Generate a character image once for the entire test module."""
    raw = generate_character_image(
        character_name=_TEST_CHARACTER,
        appearance_description="A young warrior with crimson hair, golden eyes, and silver armor.",
        art_style="anime illustration",
        pose="portrait",
    )
    result = json.loads(raw)
    yield result
    # Cleanup GCS + Firestore
    from google.cloud import firestore, storage

    bucket = storage.Client().bucket(_BUCKET_NAME)
    path = result["gs_uri"].replace(f"gs://{_BUCKET_NAME}/", "")
    blob = bucket.blob(path)
    if blob.exists():
        blob.delete()
    db = firestore.Client()
    for doc in (
        db.collection("image_assets")
        .where("character_name", "==", _TEST_CHARACTER)
        .stream()
    ):
        doc.reference.delete()


class TestGenerateCharacterImage:
    def test_status_is_success(self, character_result):
        assert character_result["status"] == "success"

    def test_has_gs_uri(self, character_result):
        assert character_result["gs_uri"].startswith(f"gs://{_BUCKET_NAME}/characters/")

    def test_has_prompt_used(self, character_result):
        assert _TEST_CHARACTER in character_result["prompt_used"]


class TestGetCharacterVisualHistory:
    def test_returns_previous_generation(self, character_result):
        raw = get_character_visual_history(_TEST_CHARACTER)
        history = json.loads(raw)
        assert len(history) >= 1
        assert history[0]["gs_uri"] == character_result["gs_uri"]
