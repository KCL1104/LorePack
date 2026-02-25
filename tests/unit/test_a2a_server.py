"""Unit tests for the A2A Server layer.

These tests mock external dependencies (google.adk, app.agent) since they
require credentials / heavy imports that aren't available in unit test env.
"""

import sys
from unittest.mock import MagicMock, patch

import pytest


# Pre-mock heavy dependencies before importing server module
@pytest.fixture(autouse=True)
def _mock_adk_modules():
    """Mock google.adk modules that aren't available in test environment."""
    mocks = {}
    modules_to_mock = [
        "google.adk",
        "google.adk.a2a",
        "google.adk.a2a.executor",
        "google.adk.a2a.executor.a2a_agent_executor",
        "google.adk.artifacts",
        "google.adk.runners",
        "google.adk.sessions",
        "app.agent",
    ]
    for mod in modules_to_mock:
        if mod not in sys.modules:
            mocks[mod] = MagicMock()
            sys.modules[mod] = mocks[mod]

    yield

    for mod, mock in mocks.items():
        if sys.modules.get(mod) is mock:
            del sys.modules[mod]


class TestBuildAgentCard:
    """Tests for _build_agent_card()."""

    def test_returns_agent_card_with_skills(self):
        """AgentCard should contain the expected skills."""
        mock_agent = MagicMock()
        mock_agent.name = "LorePack"
        mock_agent.description = "Test agent"

        mock_app_module = MagicMock()
        mock_app_module.app.root_agent = mock_agent
        sys.modules["app.agent"] = mock_app_module

        # Force reimport
        if "app.a2a.server" in sys.modules:
            del sys.modules["app.a2a.server"]

        from app.a2a.server import _build_agent_card

        card = _build_agent_card()

        assert card.name == "LorePack"
        assert card.description == "Test agent"
        assert len(card.skills) == 3
        skill_ids = {s.id for s in card.skills}
        assert "lorebook_sharing" in skill_ids
        assert "character_crossover" in skill_ids
        assert "story_generation" in skill_ids

    def test_push_notifications_enabled(self):
        """AgentCard capabilities should have push_notifications=True."""
        mock_agent = MagicMock()
        mock_agent.name = "LorePack"
        mock_agent.description = "Test"

        mock_app_module = MagicMock()
        mock_app_module.app.root_agent = mock_agent
        sys.modules["app.agent"] = mock_app_module

        if "app.a2a.server" in sys.modules:
            del sys.modules["app.a2a.server"]

        from app.a2a.server import _build_agent_card

        card = _build_agent_card()

        assert card.capabilities.push_notifications is True

    def test_default_io_modes(self):
        """AgentCard should declare text/plain as default modes."""
        mock_agent = MagicMock()
        mock_agent.name = "Test"
        mock_agent.description = None

        mock_app_module = MagicMock()
        mock_app_module.app.root_agent = mock_agent
        sys.modules["app.agent"] = mock_app_module

        if "app.a2a.server" in sys.modules:
            del sys.modules["app.a2a.server"]

        from app.a2a.server import _build_agent_card

        card = _build_agent_card()

        assert "text/plain" in card.default_input_modes
        assert "text/plain" in card.default_output_modes

    def test_fallback_description(self):
        """AgentCard should use fallback description when agent has none."""
        mock_agent = MagicMock()
        mock_agent.name = "Test"
        mock_agent.description = None

        mock_app_module = MagicMock()
        mock_app_module.app.root_agent = mock_agent
        sys.modules["app.agent"] = mock_app_module

        if "app.a2a.server" in sys.modules:
            del sys.modules["app.a2a.server"]

        from app.a2a.server import _build_agent_card

        card = _build_agent_card()

        assert card.description == "LorePack collaborative worldbuilding agent"


class TestMountA2AServer:
    """Tests for mount_a2a_server()."""

    def test_adds_routes_to_app(self):
        """mount_a2a_server should invoke A2AFastAPIApplication.add_routes_to_app."""
        if "app.a2a.server" in sys.modules:
            del sys.modules["app.a2a.server"]

        from app.a2a.server import mount_a2a_server

        with (
            patch("app.a2a.server._build_agent_card") as mock_build_card,
            patch("app.a2a.server._create_runner"),
            patch("app.a2a.server.A2AFastAPIApplication") as mock_a2a_cls,
        ):
            mock_build_card.return_value = MagicMock()
            mock_a2a_instance = MagicMock()
            mock_a2a_cls.return_value = mock_a2a_instance

            fake_app = MagicMock()
            mount_a2a_server(fake_app)

            mock_a2a_instance.add_routes_to_app.assert_called_once_with(fake_app)
