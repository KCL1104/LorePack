"""End-to-end test: Create lore → semantic search → generate chapter."""

import json

import pytest

from app.tools.lorebook_tools import add_lorebook_entry, create_lorebook
from app.tools.rag_tools import search_lore
from app.tools.story_tools import generate_chapter, get_story_chapters


@pytest.fixture(scope="module")
def fantasy_lorebook():
    """Create a populated fantasy lorebook with embeddings."""
    result = json.loads(
        create_lorebook(
            title="Stormlight Kingdom",
            genre="epic fantasy",
            description="A kingdom where storms carry magical energy and knights channel stormlight.",
        )
    )
    lb_id = result["id"]

    add_lorebook_entry(
        lb_id,
        "character",
        "Aria Stormwind",
        "A young stormlight knight with silver hair and violet eyes. "
        "She can channel storm energy through her crystal blade. "
        "Brave but impulsive, she seeks to prove herself to the Order.",
        tags="knight,stormlight,protagonist,silver hair,crystal blade",
    )

    add_lorebook_entry(
        lb_id,
        "character",
        "Kael Ironforge",
        "An old dwarven runesmith who forges weapons infused with stormlight. "
        "Gruff exterior but deeply caring. Aria's mentor and father figure.",
        tags="dwarf,runesmith,mentor,weapons",
    )

    add_lorebook_entry(
        lb_id,
        "location",
        "Crystal Tower",
        "The headquarters of the Stormlight Order. A massive tower made of "
        "living crystal that resonates with storm energy. Contains the Grand Library "
        "and the training grounds for new knights.",
        tags="tower,headquarters,stormlight order,library",
    )

    add_lorebook_entry(
        lb_id,
        "magic_system",
        "Stormlight Channeling",
        "Knights absorb energy from magical storms and channel it through "
        "crystal-infused weapons and armor. Higher ranks can create storm barriers "
        "and even fly during active storms.",
        tags="magic,stormlight,storms,channeling,crystal",
    )

    add_lorebook_entry(
        lb_id,
        "event",
        "The Great Fracture",
        "A catastrophic event 100 years ago when a rogue knight shattered the "
        "Prime Crystal, splitting the kingdom into warring storm zones. "
        "The Order has been trying to reunite the fragments ever since.",
        tags="history,catastrophe,prime crystal,war",
    )

    yield lb_id

    # Cleanup
    from google.cloud import firestore

    db = firestore.Client()
    db.recursive_delete(db.collection("lorebooks").document(lb_id))
    db.recursive_delete(db.collection("stories").document(lb_id))


@pytest.fixture(scope="module")
def generated_first_chapter(fantasy_lorebook):
    return json.loads(
        generate_chapter(
            lorebook_id=fantasy_lorebook,
            premise="Aria arrives at the Crystal Tower for her first day of training.",
            chapter_number=1,
            style="epic fantasy",
            length="short",
        )
    )


class TestSemanticSearch:
    def test_finds_relevant_by_meaning(self, fantasy_lorebook):
        """Semantic search should find 'Stormlight Channeling' for a magic query."""
        results = json.loads(
            search_lore(
                "How does magic work in this world?", lorebook_id=fantasy_lorebook
            )
        )
        assert len(results) > 0
        names = [r["name"] for r in results]
        assert "Stormlight Channeling" in names

    def test_character_search(self, fantasy_lorebook):
        """Should find Aria when asking about the protagonist."""
        results = json.loads(
            search_lore("Who is the main character?", lorebook_id=fantasy_lorebook)
        )
        assert len(results) > 0
        names = [r["name"] for r in results]
        assert "Aria Stormwind" in names

    def test_history_search(self, fantasy_lorebook):
        """Should find The Great Fracture for history queries."""
        results = json.loads(
            search_lore(
                "What catastrophe happened in the past?", lorebook_id=fantasy_lorebook
            )
        )
        assert len(results) > 0
        names = [r["name"] for r in results]
        assert "The Great Fracture" in names


class TestChapterGeneration:
    def test_generates_chapter_with_lore(self, generated_first_chapter):
        """Generate a chapter and verify it references lore entries."""
        result = generated_first_chapter
        assert "error" not in result
        assert result["chapter_number"] == 1
        assert len(result["body"]) > 100  # Should have substantial content
        assert result.get("chapter_title")

    def test_chapter_saved_to_firestore(
        self, fantasy_lorebook, generated_first_chapter
    ):
        """Generated chapters should be persisted."""
        chapters = json.loads(get_story_chapters(fantasy_lorebook))
        assert len(chapters) >= 1
        assert chapters[0]["chapter_number"] == 1
