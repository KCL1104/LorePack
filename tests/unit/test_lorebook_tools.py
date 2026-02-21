"""Unit tests for lorebook CRUD tools against live Firestore."""

import json

import pytest

from app.tools.lorebook_tools import (
    add_lorebook_entry,
    create_lorebook,
    get_lorebook,
    list_lorebooks,
    validate_lorebook_consistency,
)


def _cleanup_lorebook(lb_id: str) -> None:
    from google.cloud import firestore

    db = firestore.Client()
    db.recursive_delete(db.collection("lorebooks").document(lb_id))


@pytest.fixture(autouse=True)
def _disable_embeddings(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(
        "app.tools.rag_tools.embed_and_store_entry",
        lambda _lorebook_id, _entry_id: None,
    )


@pytest.fixture
def lorebook_id(_disable_embeddings):
    """Create a test lorebook and return its ID. Clean up after test."""
    result = json.loads(
        create_lorebook(
            title="Test Universe",
            genre="fantasy",
            description="A test world for unit testing",
        )
    )
    lb_id = result["id"]
    yield lb_id
    _cleanup_lorebook(lb_id)


@pytest.fixture(scope="class")
def lorebook_id_class():
    """Create one test lorebook per test class for read-only/add-entry checks."""
    result = json.loads(
        create_lorebook(
            title="Test Universe",
            genre="fantasy",
            description="A test world for unit testing",
        )
    )
    lb_id = result["id"]
    yield lb_id
    _cleanup_lorebook(lb_id)


class TestCreateLorebook:
    def test_creates_with_correct_fields(self, lorebook_id_class):
        result = json.loads(get_lorebook(lorebook_id_class))
        assert result["title"] == "Test Universe"
        assert result["genre"] == "fantasy"
        assert result["description"] == "A test world for unit testing"
        assert result["id"] == lorebook_id_class

    def test_appears_in_list(self, lorebook_id_class):
        summaries = json.loads(list_lorebooks())
        ids = [s["id"] for s in summaries]
        assert lorebook_id_class in ids


class TestAddEntry:
    def test_add_character_entry(self, lorebook_id_class):
        result = json.loads(
            add_lorebook_entry(
                lorebook_id=lorebook_id_class,
                category="character",
                name="Aria Stormwind",
                content="A young mage with silver hair and violet eyes.",
                tags="mage,protagonist,silver hair",
                visibility="public",
            )
        )
        assert result["name"] == "Aria Stormwind"
        assert result["category"] == "character"
        assert "mage" in result["tags"]
        assert result["visibility"] == "public"

    def test_entry_appears_in_lorebook(self, lorebook_id_class):
        add_lorebook_entry(
            lorebook_id=lorebook_id_class,
            category="location",
            name="Crystal Tower",
            content="An ancient tower made of living crystal.",
            tags="tower,landmark",
        )
        lorebook = json.loads(get_lorebook(lorebook_id_class))
        names = [e["name"] for e in lorebook["entries"]]
        assert "Crystal Tower" in names

    def test_add_to_nonexistent_lorebook(self):
        result = json.loads(
            add_lorebook_entry(
                lorebook_id="nonexistent",
                category="character",
                name="Ghost",
                content="Should fail",
            )
        )
        assert "error" in result


class TestGetLorebook:
    def test_not_found(self):
        result = json.loads(get_lorebook("nonexistent"))
        assert "error" in result


class TestValidation:
    def test_passes_with_tagged_entries(self, lorebook_id):
        add_lorebook_entry(
            lorebook_id=lorebook_id,
            category="character",
            name="Kael",
            content="A warrior.",
            tags="warrior",
        )
        result = json.loads(validate_lorebook_consistency(lorebook_id))
        assert result["status"] == "passed"

    def test_warns_on_missing_tags(self, lorebook_id):
        add_lorebook_entry(
            lorebook_id=lorebook_id,
            category="character",
            name="Unnamed",
            content="No tags here.",
            tags="",
        )
        result = json.loads(validate_lorebook_consistency(lorebook_id))
        assert result["status"] == "has_warnings"
        assert any("no tags" in issue.lower() for issue in result["issues"])

    def test_warns_on_duplicate_names(self, lorebook_id):
        add_lorebook_entry(
            lorebook_id=lorebook_id,
            category="character",
            name="Duplicate",
            content="First one.",
            tags="test",
        )
        add_lorebook_entry(
            lorebook_id=lorebook_id,
            category="character",
            name="Duplicate",
            content="Second one.",
            tags="test",
        )
        result = json.loads(validate_lorebook_consistency(lorebook_id))
        assert result["status"] == "has_warnings"
        assert any("duplicate" in issue.lower() for issue in result["issues"])
