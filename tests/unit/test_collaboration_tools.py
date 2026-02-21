"""Unit tests for collaboration tools against live Firestore."""

import json

import pytest

from app.tools.collaboration_tools import (
    accept_crossover,
    export_lorebook,
    import_lorebook,
    list_public_lorebooks,
    propose_crossover,
)
from app.tools.lorebook_tools import add_lorebook_entry, create_lorebook


@pytest.fixture(scope="class")
def two_lorebooks():
    """Create two test lorebooks with public and private entries. Clean up after."""
    from app.tools import rag_tools

    original_embed_and_store = rag_tools.embed_and_store_entry
    rag_tools.embed_and_store_entry = lambda _lorebook_id, _entry_id: None

    lb1 = json.loads(
        create_lorebook(
            title="Fantasy World",
            genre="fantasy",
            description="A fantasy test world",
        )
    )
    lb2 = json.loads(
        create_lorebook(
            title="Sci-Fi World",
            genre="sci-fi",
            description="A sci-fi test world",
        )
    )

    # LB1: 2 public entries, 1 private entry
    add_lorebook_entry(
        lb1["id"],
        "character",
        "Aria Stormwind",
        "A fire mage with silver hair.",
        tags="mage,fire",
        visibility="public",
    )
    add_lorebook_entry(
        lb1["id"],
        "character",
        "Kael Ironforge",
        "A dwarven blacksmith.",
        tags="dwarf,blacksmith",
        visibility="public",
    )
    add_lorebook_entry(
        lb1["id"],
        "location",
        "Secret Vault",
        "A hidden vault under the mountain.",
        tags="vault,secret",
        visibility="private",
    )

    # LB2: 1 public entry with a name that conflicts with LB1
    add_lorebook_entry(
        lb2["id"],
        "character",
        "Aria Stormwind",
        "A starship captain with the same name.",
        tags="captain,space",
        visibility="public",
    )
    add_lorebook_entry(
        lb2["id"],
        "location",
        "Space Station Alpha",
        "An orbital station.",
        tags="station,orbit",
        visibility="private",
    )

    try:
        yield lb1["id"], lb2["id"]
    finally:
        # Cleanup both lorebooks
        from google.cloud import firestore

        db = firestore.Client()
        for lb_id in (lb1["id"], lb2["id"]):
            db.recursive_delete(db.collection("lorebooks").document(lb_id))
        rag_tools.embed_and_store_entry = original_embed_and_store


@pytest.fixture(scope="class")
def _cleanup_imported():
    """Track and clean up lorebooks created by import_lorebook."""
    imported_ids = []
    yield imported_ids
    from google.cloud import firestore

    db = firestore.Client()
    for lb_id in imported_ids:
        db.recursive_delete(db.collection("lorebooks").document(lb_id))


@pytest.fixture(scope="class")
def exported_lorebook_package(two_lorebooks):
    lb1_id, _ = two_lorebooks
    package_json = export_lorebook(lb1_id)
    return lb1_id, package_json, json.loads(package_json)


@pytest.fixture(scope="class")
def imported_lorebook(exported_lorebook_package, _cleanup_imported):
    lb1_id, package_json, _ = exported_lorebook_package
    result = json.loads(import_lorebook(package_json))
    _cleanup_imported.append(result["lorebook_id"])
    return lb1_id, result


class TestExportLorebook:
    def test_only_includes_public_entries(self, exported_lorebook_package):
        _, _, package = exported_lorebook_package
        assert len(package["entries"]) == 2
        for entry in package["entries"]:
            assert entry["visibility"] == "public"

    def test_strips_embeddings(self, exported_lorebook_package):
        _, _, package = exported_lorebook_package
        for entry in package["entries"]:
            assert "embedding" not in entry

    def test_includes_metadata(self, exported_lorebook_package):
        _, _, package = exported_lorebook_package
        assert package["title"] == "Fantasy World"
        assert package["genre"] == "fantasy"
        assert "exported_at" in package

    def test_not_found(self):
        result = json.loads(export_lorebook("nonexistent"))
        assert "error" in result


class TestImportLorebook:
    def test_creates_with_imported_prefix(self, imported_lorebook):
        _, result = imported_lorebook

        assert result["status"] == "success"
        assert result["title"].startswith("[Imported]")
        assert "Fantasy World" in result["title"]
        assert result["entries_imported"] == 2

    def test_new_lorebook_has_different_id(self, imported_lorebook):
        lb1_id, result = imported_lorebook

        assert result["lorebook_id"] != lb1_id


class TestListPublicLorebooks:
    def test_only_shows_lorebooks_with_public_entries(self, two_lorebooks):
        lb1_id, lb2_id = two_lorebooks
        results = json.loads(list_public_lorebooks())
        ids = [r["id"] for r in results]
        # LB1 has 2 public entries, LB2 has 1 public entry
        assert lb1_id in ids
        assert lb2_id in ids

    def test_returns_correct_public_count(self, two_lorebooks):
        lb1_id, lb2_id = two_lorebooks
        results = json.loads(list_public_lorebooks())
        by_id = {r["id"]: r for r in results}
        assert by_id[lb1_id]["public_entry_count"] == 2
        assert by_id[lb2_id]["public_entry_count"] == 1

    def test_excludes_all_private_lorebook(self, _cleanup_imported):
        """A lorebook with only private entries should not appear."""
        lb = json.loads(
            create_lorebook(
                title="Private Only",
                genre="mystery",
                description="All private",
            )
        )
        _cleanup_imported.append(lb["id"])
        add_lorebook_entry(
            lb["id"],
            "character",
            "Secret Agent",
            "Hidden.",
            tags="secret",
            visibility="private",
        )

        results = json.loads(list_public_lorebooks())
        ids = [r["id"] for r in results]
        assert lb["id"] not in ids


class TestProposeCrossover:
    def test_detects_naming_conflicts(self, two_lorebooks):
        lb1_id, lb2_id = two_lorebooks
        result = json.loads(propose_crossover(lb1_id, lb2_id, "Aria Stormwind"))
        assert result["has_conflicts"] is True
        assert "Aria Stormwind" in result["conflicts"]

    def test_finds_characters(self, two_lorebooks):
        lb1_id, lb2_id = two_lorebooks
        result = json.loads(propose_crossover(lb1_id, lb2_id, "Kael Ironforge"))
        assert len(result["characters"]) == 1
        assert result["characters"][0]["name"] == "Kael Ironforge"
        assert result["has_conflicts"] is False

    def test_reports_not_found(self, two_lorebooks):
        lb1_id, lb2_id = two_lorebooks
        result = json.loads(propose_crossover(lb1_id, lb2_id, "Nonexistent Character"))
        assert "Nonexistent Character" in result["not_found"]

    def test_source_not_found(self):
        result = json.loads(propose_crossover("nonexistent", "also_nonexistent", "A"))
        assert "error" in result


class TestAcceptCrossover:
    def test_copies_characters_to_target(self, two_lorebooks):
        lb1_id, lb2_id = two_lorebooks
        proposal = propose_crossover(lb1_id, lb2_id, "Kael Ironforge")
        result = json.loads(accept_crossover(proposal))

        assert result["status"] == "success"
        assert result["entries_copied"] == 1
        assert result["copied"][0]["name"] == "Kael Ironforge"

        # Verify entry exists in target lorebook
        from app.tools.lorebook_tools import get_lorebook

        target = json.loads(get_lorebook(lb2_id))
        names = [e["name"] for e in target["entries"]]
        assert "Kael Ironforge" in names

    def test_target_not_found(self):
        proposal = json.dumps(
            {
                "source_lorebook_id": "a",
                "target_lorebook_id": "nonexistent",
                "characters": [{"name": "X", "content": "test"}],
            }
        )
        result = json.loads(accept_crossover(proposal))
        assert "error" in result
