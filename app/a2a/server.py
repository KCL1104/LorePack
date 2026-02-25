"""A2A Server layer for LorePack.

Mounts the a2a-sdk's A2AFastAPIApplication onto the existing FastAPI app,
exposing:
  - GET /.well-known/agent-card.json  (AgentCard discovery)
  - POST /                            (JSON-RPC: message/send, tasks/get, etc.)
"""

import logging
import os

import httpx
from a2a.server.apps.jsonrpc.fastapi_app import A2AFastAPIApplication
from a2a.server.request_handlers.default_request_handler import (
    DefaultRequestHandler,
)
from a2a.server.tasks import (
    BasePushNotificationSender,
    InMemoryPushNotificationConfigStore,
    InMemoryTaskStore,
)
from a2a.types import AgentCapabilities, AgentCard, AgentSkill, TransportProtocol
from fastapi import FastAPI
from google.adk.a2a.executor.a2a_agent_executor import A2aAgentExecutor
from google.adk.artifacts import InMemoryArtifactService
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService

logger = logging.getLogger(__name__)


def _build_agent_card() -> AgentCard:
    """Build the platform-level AgentCard (reuses logic from agent_engine_app)."""
    from app.agent import app as adk_app

    agent = adk_app.root_agent

    return AgentCard(
        name=agent.name,
        description=agent.description or "LorePack collaborative worldbuilding agent",
        url="http://localhost:8000/",
        version=os.getenv("AGENT_VERSION", "0.1.0"),
        capabilities=AgentCapabilities(
            streaming=False,
            push_notifications=True,
        ),
        default_input_modes=["text/plain"],
        default_output_modes=["text/plain"],
        supports_authenticated_extended_card=True,
        preferred_transport=TransportProtocol.jsonrpc,
        skills=[
            AgentSkill(
                id="lorebook_sharing",
                name="Lorebook Sharing",
                description=(
                    "Can export and import worldbuilding lorebooks. "
                    "Public lorebook entries can be shared with other agents "
                    "via the A2A protocol for cross-user collaboration."
                ),
                tags=["worldbuilding", "lorebook", "sharing", "export", "import"],
                examples=[
                    "Share my fantasy lorebook with another user",
                    "Import a lorebook from another agent",
                    "List all publicly available lorebooks",
                ],
            ),
            AgentSkill(
                id="character_crossover",
                name="Character Crossover",
                description=(
                    "Can negotiate character crossover rules between lorebooks. "
                    "Supports proposing, evaluating, and accepting crossover of "
                    "characters from one worldbuilding universe into another, "
                    "with automatic conflict detection."
                ),
                tags=["crossover", "character", "negotiation", "collaboration"],
                examples=[
                    "Propose a crossover of Aria Stormwind into the sci-fi universe",
                    "Check if these characters conflict with my existing lore",
                    "Accept the crossover proposal and merge characters",
                ],
            ),
            AgentSkill(
                id="story_generation",
                name="Illustrated Story Generation",
                description=(
                    "Can conjure a new story world from genre, era, and protagonist "
                    "parameters, then generate illustrated chapters grounded in "
                    "lorebook entries via RAG."
                ),
                tags=["story", "chapter", "generation", "illustration", "RAG"],
                examples=[
                    "Conjure a dark fantasy world with a warrior protagonist",
                    "Generate Chapter 2 of the ongoing story",
                ],
            ),
        ],
    )


def _create_runner() -> Runner:
    """Create a Runner for the A2A executor."""
    from app.agent import app as adk_app

    return Runner(
        app=adk_app,
        session_service=InMemorySessionService(),
        artifact_service=InMemoryArtifactService(),
    )


def mount_a2a_server(app: FastAPI) -> None:
    """Mount A2A protocol endpoints onto the FastAPI application.

    This registers:
      - GET /.well-known/agent-card.json
      - POST / (JSON-RPC endpoint)
    """
    agent_card = _build_agent_card()

    agent_executor = A2aAgentExecutor(runner=_create_runner)

    task_store = InMemoryTaskStore()
    push_config_store = InMemoryPushNotificationConfigStore()
    push_sender = BasePushNotificationSender(
        httpx_client=httpx.AsyncClient(),
        config_store=push_config_store,
    )

    request_handler = DefaultRequestHandler(
        agent_executor=agent_executor,
        task_store=task_store,
        push_config_store=push_config_store,
        push_sender=push_sender,
    )

    a2a_app = A2AFastAPIApplication(
        agent_card=agent_card,
        http_handler=request_handler,
    )

    a2a_app.add_routes_to_app(app)

    logger.info("A2A server mounted: /.well-known/agent-card.json + JSON-RPC POST /")
