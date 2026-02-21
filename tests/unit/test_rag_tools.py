"""Unit tests for RAG search tools against live Firestore."""

import json

import pytest

from app.tools.lorebook_tools import add_lorebook_entry, create_lorebook
from app.tools.rag_tools import search_lore


@pytest.fixture(scope="module")
def populated_lorebook():
    """Create a lorebook with several entries for search testing."""
    result = json.loads(
        create_lorebook(
            title="Search Test World",
            genre="fantasy",
            description="World for testing RAG search",
        )
    )
    lb_id = result["id"]

    add_lorebook_entry(
        lb_id,
        "character",
        "Aria Stormwind",
        "A young fire mage with silver hair who commands flame magic.",
        tags="mage,fire,protagonist",
    )
    add_lorebook_entry(
        lb_id,
        "character",
        "Kael Ironforge",
        "A dwarven blacksmith who forges enchanted weapons.",
        tags="dwarf,blacksmith,weapons",
    )
    add_lorebook_entry(
        lb_id,
        "location",
        "Crystal Tower",
        "An ancient tower of living crystal where mages study.",
        tags="tower,magic,academy",
    )
    add_lorebook_entry(
        lb_id,
        "magic_system",
        "Flame Weaving",
        "A school of fire magic that draws power from volcanic energy.",
        tags="fire,magic,volcano",
    )

    yield lb_id

    # Cleanup
    from google.cloud import firestore

    db = firestore.Client()
    db.recursive_delete(db.collection("lorebooks").document(lb_id))


class TestSearchLore:
    def test_finds_by_keyword(self, populated_lorebook):
        results = json.loads(search_lore("fire magic", lorebook_id=populated_lorebook))
        assert len(results) > 0
        names = [r["name"] for r in results]
        assert "Aria Stormwind" in names or "Flame Weaving" in names

    def test_respects_top_k(self, populated_lorebook):
        results = json.loads(
            search_lore("magic", lorebook_id=populated_lorebook, top_k=2)
        )
        assert len(results) <= 2

    def test_low_scores_for_unrelated_query(self, populated_lorebook):
        results = json.loads(
            search_lore("spaceship quantum drive", lorebook_id=populated_lorebook)
        )
        # Semantic search may return weak matches; verify scores are low
        for r in results:
            assert r["relevance_score"] < 0.6

    def test_scoped_to_lorebook(self, populated_lorebook):
        results = json.loads(search_lore("fire", lorebook_id=populated_lorebook))
        for r in results:
            assert r["lorebook_id"] == populated_lorebook

    def test_returns_empty_for_nonexistent_lorebook(self):
        results = json.loads(search_lore("anything", lorebook_id="nonexistent"))
        assert results == []
