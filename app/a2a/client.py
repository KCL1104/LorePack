"""A2A Client layer for LorePack.

Provides helpers to discover remote A2A agents and send messages
using the a2a-sdk's ClientFactory.
"""

import json
import logging
import uuid

import httpx
from a2a.client.card_resolver import A2ACardResolver
from a2a.client.client import ClientConfig
from a2a.client.client_factory import ClientFactory
from a2a.types import (
    AgentCard,
    Message,
    MessageSendParams,
    Part,
    Role,
    Task,
    TaskState,
    TextPart,
)

logger = logging.getLogger(__name__)


async def discover_agent(base_url: str) -> AgentCard:
    """Resolve a remote agent's AgentCard from its base URL.

    Fetches ``/.well-known/agent-card.json`` at *base_url*.

    Args:
        base_url: Root URL of the remote agent (e.g. ``http://agent.example.com``).

    Returns:
        The remote agent's ``AgentCard``.
    """
    async with httpx.AsyncClient() as http_client:
        resolver = A2ACardResolver(http_client, base_url)
        card = await resolver.get_agent_card()
    logger.info("Discovered agent '%s' at %s", card.name, base_url)
    return card


async def send_to_remote_agent(
    base_url: str,
    message_text: str,
    *,
    context_id: str | None = None,
) -> str:
    """Send a text message to a remote A2A agent and return its response.

    Uses ``ClientFactory.connect()`` to auto-negotiate transport based on
    the remote AgentCard, then sends a ``message/send`` request and collects
    the final result.

    Args:
        base_url: Root URL of the remote agent.
        message_text: The plain-text message to send.
        context_id: Optional conversation context ID for multi-turn.

    Returns:
        JSON string with ``{ "status": ..., "response": ... }``.
    """
    config = ClientConfig(streaming=False)
    client = await ClientFactory.connect(base_url, client_config=config)

    message = Message(
        message_id=str(uuid.uuid4()),
        role=Role.user,
        parts=[Part(root=TextPart(text=message_text))],
        context_id=context_id,
    )

    result_text = ""
    task_status = "unknown"

    async for event in client.send_message(
        request=message,
    ):
        if isinstance(event, Message):
            # Direct message response (no task created)
            for part in event.parts or []:
                if hasattr(part.root, "text"):
                    result_text += part.root.text
            task_status = "completed"
        elif isinstance(event, tuple):
            task, _update = event
            if isinstance(task, Task):
                task_status = task.status.state.value if task.status else "unknown"
                # Extract text from artifacts
                for artifact in task.artifacts or []:
                    for part in artifact.parts or []:
                        if hasattr(part.root, "text"):
                            result_text += part.root.text
                # Also check status message
                if (
                    task.status
                    and task.status.message
                    and task.status.state == TaskState.completed
                ):
                    for part in task.status.message.parts or []:
                        if hasattr(part.root, "text") and not result_text:
                            result_text += part.root.text

    return json.dumps(
        {"status": task_status, "response": result_text},
        ensure_ascii=False,
    )
