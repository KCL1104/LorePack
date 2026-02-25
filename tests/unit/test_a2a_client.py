"""Unit tests for the A2A Client layer."""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from a2a.types import AgentCapabilities, AgentCard, AgentSkill, TransportProtocol


@pytest.fixture
def sample_agent_card():
    return AgentCard(
        name="Test Agent",
        description="A test remote agent",
        url="http://remote.example.com/",
        version="1.0.0",
        capabilities=AgentCapabilities(streaming=False),
        default_input_modes=["text/plain"],
        default_output_modes=["text/plain"],
        preferred_transport=TransportProtocol.jsonrpc,
        skills=[
            AgentSkill(
                id="test_skill",
                name="Test Skill",
                description="A test skill",
                tags=["test"],
                examples=["test example"],
            ),
        ],
    )


class TestDiscoverAgent:
    """Tests for discover_agent()."""

    @pytest.mark.asyncio
    @patch("app.a2a.client.A2ACardResolver")
    @patch("app.a2a.client.httpx.AsyncClient")
    async def test_returns_agent_card(
        self, mock_http_cls, mock_resolver_cls, sample_agent_card
    ):
        """discover_agent should resolve and return a remote AgentCard."""
        mock_resolver = MagicMock()
        mock_resolver.get_agent_card = AsyncMock(return_value=sample_agent_card)
        mock_resolver_cls.return_value = mock_resolver

        mock_http = AsyncMock()
        mock_http_cls.return_value.__aenter__ = AsyncMock(return_value=mock_http)
        mock_http_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        from app.a2a.client import discover_agent

        card = await discover_agent("http://remote.example.com")
        assert card.name == "Test Agent"
        assert len(card.skills) == 1
        assert card.skills[0].id == "test_skill"

    @pytest.mark.asyncio
    @patch("app.a2a.client.A2ACardResolver")
    @patch("app.a2a.client.httpx.AsyncClient")
    async def test_resolver_called_with_base_url(
        self, mock_http_cls, mock_resolver_cls, sample_agent_card
    ):
        """discover_agent should pass the base URL to the resolver."""
        mock_resolver = MagicMock()
        mock_resolver.get_agent_card = AsyncMock(return_value=sample_agent_card)
        mock_resolver_cls.return_value = mock_resolver

        mock_http = AsyncMock()
        mock_http_cls.return_value.__aenter__ = AsyncMock(return_value=mock_http)
        mock_http_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        from app.a2a.client import discover_agent

        await discover_agent("http://custom-host:9090")

        # Verify the resolver was constructed with the right URL
        mock_resolver_cls.assert_called_once()
        call_args = mock_resolver_cls.call_args
        assert "http://custom-host:9090" in str(call_args)


class TestSendToRemoteAgent:
    """Tests for send_to_remote_agent()."""

    @pytest.mark.asyncio
    @patch("app.a2a.client.ClientFactory")
    async def test_returns_json_response(self, mock_factory_cls):
        """send_to_remote_agent should return JSON with status and response."""
        from a2a.types import (
            Artifact,
            Part,
            Task,
            TaskState,
            TaskStatus,
            TextPart,
        )

        # Create a mock task with a text artifact
        mock_task = Task(
            id="task-123",
            context_id="ctx-1",
            status=TaskStatus(state=TaskState.completed),
            artifacts=[
                Artifact(
                    artifact_id="art-1",
                    parts=[Part(root=TextPart(text="Hello from remote!"))],
                ),
            ],
        )

        mock_client = AsyncMock()

        async def mock_send_message(**kwargs):
            yield (mock_task, None)

        mock_client.send_message = mock_send_message
        mock_factory_cls.connect = AsyncMock(return_value=mock_client)

        from app.a2a.client import send_to_remote_agent

        result = await send_to_remote_agent("http://remote.example.com", "Hello")
        parsed = json.loads(result)

        assert parsed["status"] == "completed"
        assert "Hello from remote!" in parsed["response"]

    @pytest.mark.asyncio
    @patch("app.a2a.client.ClientFactory")
    async def test_handles_direct_message_response(self, mock_factory_cls):
        """send_to_remote_agent should handle direct Message events."""
        from a2a.types import Message, Part, Role, TextPart

        mock_message = Message(
            message_id="msg-1",
            role=Role.agent,
            parts=[Part(root=TextPart(text="Direct response"))],
        )

        mock_client = AsyncMock()

        async def mock_send_message(**kwargs):
            yield mock_message

        mock_client.send_message = mock_send_message
        mock_factory_cls.connect = AsyncMock(return_value=mock_client)

        from app.a2a.client import send_to_remote_agent

        result = await send_to_remote_agent("http://remote.example.com", "Hi")
        parsed = json.loads(result)

        assert parsed["status"] == "completed"
        assert "Direct response" in parsed["response"]
