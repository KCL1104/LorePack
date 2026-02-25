"""Unit tests for the A2A Agent Registry."""

import pytest

from app.a2a.registry import AgentRegistry


@pytest.fixture
def registry():
    """Create a fresh registry for each test."""
    return AgentRegistry(base_url="http://localhost:8000")


@pytest.fixture
def sample_lorebook():
    return {
        "title": "Fantasy World",
        "genre": "fantasy",
        "description": "A high-fantasy world of swords and sorcery.",
    }


@pytest.fixture
def sample_entries():
    return [
        {
            "name": "Aria Stormwind",
            "category": "character",
            "content": "A fire mage with silver hair.",
            "tags": ["mage", "fire"],
            "visibility": "public",
        },
        {
            "name": "Dragon Keep",
            "category": "location",
            "content": "A fortress built into a mountain.",
            "tags": ["fortress", "mountain"],
            "visibility": "public",
        },
    ]


class TestRegisterLorebook:
    """Tests for AgentRegistry.register_lorebook()."""

    def test_returns_agent_id(self, registry, sample_lorebook, sample_entries):
        agent_id = registry.register_lorebook("lb-001", sample_lorebook, sample_entries)
        assert agent_id == "lb-lb-001"

    def test_agent_card_has_correct_name(self, registry, sample_lorebook, sample_entries):
        agent_id = registry.register_lorebook("lb-001", sample_lorebook, sample_entries)
        card = registry.get_card(agent_id)
        assert card is not None
        assert card.name == "Fantasy World Agent"

    def test_agent_card_includes_world_knowledge_skill(self, registry, sample_lorebook, sample_entries):
        agent_id = registry.register_lorebook("lb-001", sample_lorebook, sample_entries)
        card = registry.get_card(agent_id)
        skill_ids = {s.id for s in card.skills}
        assert "world_knowledge" in skill_ids

    def test_agent_card_includes_character_interaction_skill(self, registry, sample_lorebook, sample_entries):
        """Should include character_interaction skill when character entries exist."""
        agent_id = registry.register_lorebook("lb-001", sample_lorebook, sample_entries)
        card = registry.get_card(agent_id)
        skill_ids = {s.id for s in card.skills}
        assert "character_interaction" in skill_ids

    def test_no_character_skill_without_characters(self, registry, sample_lorebook):
        """Should NOT include character_interaction skill when no character entries."""
        entries = [
            {
                "name": "Dragon Keep",
                "category": "location",
                "content": "A fortress.",
                "tags": [],
                "visibility": "public",
            },
        ]
        agent_id = registry.register_lorebook("lb-002", sample_lorebook, entries)
        card = registry.get_card(agent_id)
        skill_ids = {s.id for s in card.skills}
        assert "character_interaction" not in skill_ids

    def test_agent_card_url_format(self, registry, sample_lorebook, sample_entries):
        agent_id = registry.register_lorebook("lb-001", sample_lorebook, sample_entries)
        card = registry.get_card(agent_id)
        assert card.url == "http://localhost:8000/a2a/agents/lb-lb-001/"

    def test_agent_card_declares_image_output(self, registry, sample_lorebook, sample_entries):
        """AgentCard should include image/png in default_output_modes."""
        agent_id = registry.register_lorebook("lb-001", sample_lorebook, sample_entries)
        card = registry.get_card(agent_id)
        assert "text/plain" in card.default_output_modes
        assert "image/png" in card.default_output_modes

    def test_reregistration_updates_agent(self, registry, sample_lorebook, sample_entries):
        """Re-registering the same lorebook should update the existing agent."""
        registry.register_lorebook("lb-001", sample_lorebook, sample_entries)
        assert len(registry.list_agents()) == 1

        updated_lorebook = {**sample_lorebook, "title": "Updated World"}
        registry.register_lorebook("lb-001", updated_lorebook, sample_entries)

        agents = registry.list_agents()
        assert len(agents) == 1
        assert agents[0]["name"] == "Updated World Agent"


class TestUnregisterLorebook:
    """Tests for AgentRegistry.unregister_lorebook()."""

    def test_removes_agent(self, registry, sample_lorebook, sample_entries):
        agent_id = registry.register_lorebook("lb-001", sample_lorebook, sample_entries)
        assert registry.get_agent(agent_id) is not None

        registry.unregister_lorebook(agent_id)
        assert registry.get_agent(agent_id) is None

    def test_unregister_nonexistent_is_safe(self, registry):
        """Unregistering a nonexistent agent should not raise."""
        registry.unregister_lorebook("nonexistent-id")


class TestListAgents:
    """Tests for AgentRegistry.list_agents()."""

    def test_empty_registry(self, registry):
        assert registry.list_agents() == []

    def test_lists_all_registered(self, registry, sample_lorebook, sample_entries):
        registry.register_lorebook("lb-001", sample_lorebook, sample_entries)
        registry.register_lorebook(
            "lb-002",
            {"title": "Sci-Fi World", "genre": "sci-fi", "description": ""},
            [{"name": "Space Ship", "category": "item", "content": "A ship.", "tags": [], "visibility": "public"}],
        )

        agents = registry.list_agents()
        assert len(agents) == 2
        names = {a["name"] for a in agents}
        assert "Fantasy World Agent" in names
        assert "Sci-Fi World Agent" in names

    def test_agent_dict_structure(self, registry, sample_lorebook, sample_entries):
        registry.register_lorebook("lb-001", sample_lorebook, sample_entries)
        agents = registry.list_agents()
        agent = agents[0]

        assert "id" in agent
        assert "name" in agent
        assert "description" in agent
        assert "url" in agent
        assert "lorebook_id" in agent
        assert "skills" in agent
        assert "status" in agent
        assert agent["status"] == "active"


class TestGetCard:
    """Tests for AgentRegistry.get_card()."""

    def test_returns_none_for_unknown(self, registry):
        assert registry.get_card("nonexistent") is None

    def test_returns_card_for_registered(self, registry, sample_lorebook, sample_entries):
        agent_id = registry.register_lorebook("lb-001", sample_lorebook, sample_entries)
        card = registry.get_card(agent_id)
        assert card is not None
        assert card.name == "Fantasy World Agent"


class TestLorebookAgentExecutor:
    """Tests for the LorebookAgentExecutor internals."""

    def test_build_system_prompt(self, sample_lorebook, sample_entries):
        """_build_system_prompt should include lorebook metadata and entries."""
        from app.a2a.lorebook_executor import _build_system_prompt

        prompt = _build_system_prompt(sample_lorebook, sample_entries)

        assert "Fantasy World" in prompt
        assert "fantasy" in prompt
        assert "Aria Stormwind" in prompt
        assert "Dragon Keep" in prompt
        assert "Stay in character" in prompt

    def test_build_system_prompt_empty_entries(self, sample_lorebook):
        """Should still produce a valid prompt with no entries."""
        from app.a2a.lorebook_executor import _build_system_prompt

        prompt = _build_system_prompt(sample_lorebook, [])
        assert "Fantasy World" in prompt
        assert "Stay in character" in prompt

    def test_accepts_image_false_by_default(self):
        """_accepts_image should return False when no output modes specified."""
        from app.a2a.lorebook_executor import LorebookAgentExecutor
        from unittest.mock import MagicMock

        ctx = MagicMock(spec=[])  # No accepted_output_modes attr
        assert LorebookAgentExecutor._accepts_image(ctx) is False

    def test_accepts_image_true_for_image_star(self):
        """_accepts_image should return True for image/*."""
        from app.a2a.lorebook_executor import LorebookAgentExecutor
        from unittest.mock import MagicMock

        ctx = MagicMock()
        ctx.accepted_output_modes = ["text/plain", "image/*"]
        assert LorebookAgentExecutor._accepts_image(ctx) is True

    def test_accepts_image_true_for_image_png(self):
        """_accepts_image should return True for image/png."""
        from app.a2a.lorebook_executor import LorebookAgentExecutor
        from unittest.mock import MagicMock

        ctx = MagicMock()
        ctx.accepted_output_modes = ["image/png"]
        assert LorebookAgentExecutor._accepts_image(ctx) is True

    def test_accepts_image_false_for_text_only(self):
        """_accepts_image should return False for text/plain only."""
        from app.a2a.lorebook_executor import LorebookAgentExecutor
        from unittest.mock import MagicMock

        ctx = MagicMock()
        ctx.accepted_output_modes = ["text/plain"]
        assert LorebookAgentExecutor._accepts_image(ctx) is False
