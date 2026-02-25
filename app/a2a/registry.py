"""Lorebook Agent Registry — manages per-lorebook A2A agent instances.

Each lorebook with at least one public entry is automatically registered
as an A2A agent with its own AgentCard and LorebookAgentExecutor.

TODO(future): Support register_character(lorebook_id, entry_id) for
character-level agent granularity.
"""

import logging
import os
from dataclasses import dataclass

from a2a.server.request_handlers.default_request_handler import (
    DefaultRequestHandler,
)
from a2a.server.tasks import InMemoryTaskStore
from a2a.types import AgentCapabilities, AgentCard, AgentSkill, TransportProtocol

from app.a2a.lorebook_executor import LorebookAgentExecutor

logger = logging.getLogger(__name__)


@dataclass
class RegisteredAgent:
    """A registered lorebook agent."""

    agent_id: str
    lorebook_id: str
    agent_card: AgentCard
    executor: LorebookAgentExecutor
    request_handler: DefaultRequestHandler


class AgentRegistry:
    """Manages dynamically registered lorebook agents."""

    def __init__(self, base_url: str | None = None):
        self._base_url = (
            base_url or os.getenv("A2A_BASE_URL", "http://localhost:8000")
        ).rstrip("/")
        self._agents: dict[str, RegisteredAgent] = {}
        # Map lorebook_id -> agent_id for dedup
        self._lorebook_to_agent: dict[str, str] = {}

    def register_lorebook(
        self, lorebook_id: str, lorebook_data: dict, public_entries: list[dict]
    ) -> str:
        """Register a lorebook as an A2A agent.

        Args:
            lorebook_id: The Firestore lorebook ID.
            lorebook_data: Lorebook metadata dict (title, genre, description, etc.).
            public_entries: List of public entry dicts.

        Returns:
            The agent_id for the registered agent.
        """
        # If already registered, update it
        if lorebook_id in self._lorebook_to_agent:
            old_id = self._lorebook_to_agent[lorebook_id]
            self.unregister_lorebook(old_id)

        agent_id = f"lb-{lorebook_id}"
        title = lorebook_data.get("title", "Unknown World")
        genre = lorebook_data.get("genre", "")
        description = lorebook_data.get("description", "")

        # Build skills from public entries
        entry_categories = set()
        character_names = []
        for entry in public_entries:
            entry_categories.add(entry.get("category", "other"))
            if entry.get("category") == "character":
                character_names.append(entry.get("name", "Unknown"))

        skills = [
            AgentSkill(
                id="world_knowledge",
                name=f"{title} World Knowledge",
                description=(
                    f'Can answer questions about the world of "{title}" '
                    f"based on {len(public_entries)} public lore entries. "
                    f"Categories: {', '.join(sorted(entry_categories))}."
                ),
                tags=["worldbuilding", "lore", genre]
                if genre
                else ["worldbuilding", "lore"],
                examples=[
                    f"Tell me about the world of {title}",
                    f"What are the main characters in {title}?",
                ],
            ),
        ]

        if character_names:
            skills.append(
                AgentSkill(
                    id="character_interaction",
                    name="Character Interaction",
                    description=(
                        f'Can roleplay or answer as characters from "{title}": '
                        f"{', '.join(character_names[:5])}"
                        f"{'...' if len(character_names) > 5 else ''}."
                    ),
                    tags=["character", "roleplay", "interaction"],
                    examples=[
                        f"What would {character_names[0]} say about this situation?"
                        if character_names
                        else "Talk to a character from this world",
                    ],
                )
            )

        agent_url = f"{self._base_url}/a2a/agents/{agent_id}/"

        agent_card = AgentCard(
            name=f"{title} Agent",
            description=description
            or f'A2A agent representing the world of "{title}".',
            url=agent_url,
            version="0.1.0",
            capabilities=AgentCapabilities(streaming=False),
            default_input_modes=["text/plain"],
            default_output_modes=["text/plain", "image/png"],
            preferred_transport=TransportProtocol.jsonrpc,
            skills=skills,
        )

        executor = LorebookAgentExecutor(lorebook_data, public_entries)
        task_store = InMemoryTaskStore()

        request_handler = DefaultRequestHandler(
            agent_executor=executor,
            task_store=task_store,
        )

        registered = RegisteredAgent(
            agent_id=agent_id,
            lorebook_id=lorebook_id,
            agent_card=agent_card,
            executor=executor,
            request_handler=request_handler,
        )

        self._agents[agent_id] = registered
        self._lorebook_to_agent[lorebook_id] = agent_id

        logger.info(
            "Registered lorebook '%s' (id=%s) as A2A agent '%s' with %d public entries",
            title,
            lorebook_id,
            agent_id,
            len(public_entries),
        )
        return agent_id

    def unregister_lorebook(self, agent_id: str) -> None:
        """Remove a registered lorebook agent."""
        registered = self._agents.pop(agent_id, None)
        if registered:
            self._lorebook_to_agent.pop(registered.lorebook_id, None)
            logger.info("Unregistered agent '%s'", agent_id)

    def get_agent(self, agent_id: str) -> RegisteredAgent | None:
        """Get a registered agent by ID."""
        return self._agents.get(agent_id)

    def get_card(self, agent_id: str) -> AgentCard | None:
        """Get AgentCard for a registered agent."""
        agent = self._agents.get(agent_id)
        return agent.agent_card if agent else None

    def list_agents(self) -> list[dict]:
        """List all registered agents as serializable dicts."""
        results = []
        for agent in self._agents.values():
            card = agent.agent_card
            results.append(
                {
                    "id": agent.agent_id,
                    "name": card.name,
                    "description": card.description,
                    "url": card.url,
                    "lorebook_id": agent.lorebook_id,
                    "skills": [
                        {
                            "id": s.id,
                            "name": s.name,
                            "description": s.description,
                            "tags": s.tags or [],
                        }
                        for s in (card.skills or [])
                    ],
                    "status": "active",
                }
            )
        return results

    def sync_from_firestore(self) -> dict:
        """Scan all lorebooks and auto-register those with public entries.

        Returns a summary dict with counts.
        """
        from google.cloud import firestore

        db = firestore.Client()
        lorebooks_col = db.collection("lorebooks")

        registered = 0
        unregistered = 0
        current_lorebook_ids = set()

        for lb_snap in lorebooks_col.stream():
            lb = lb_snap.to_dict()
            lb_id = lb.get("id", lb_snap.id)
            current_lorebook_ids.add(lb_id)

            # Count public entries
            entries_ref = lorebooks_col.document(lb_id).collection("entries")
            public_entries = []
            for entry_snap in entries_ref.stream():
                entry = entry_snap.to_dict()
                if entry.get("visibility") == "public":
                    entry.pop("embedding", None)
                    public_entries.append(entry)

            if public_entries:
                self.register_lorebook(lb_id, lb, public_entries)
                registered += 1
            elif lb_id in self._lorebook_to_agent:
                # Was registered but no longer has public entries
                agent_id = self._lorebook_to_agent[lb_id]
                self.unregister_lorebook(agent_id)
                unregistered += 1

        # Remove agents for lorebooks that no longer exist
        stale_ids = [
            agent_id
            for lb_id, agent_id in list(self._lorebook_to_agent.items())
            if lb_id not in current_lorebook_ids
        ]
        for agent_id in stale_ids:
            self.unregister_lorebook(agent_id)
            unregistered += 1

        logger.info(
            "Registry sync complete: %d registered, %d unregistered, %d total active",
            registered,
            unregistered,
            len(self._agents),
        )
        return {
            "registered": registered,
            "unregistered": unregistered,
            "total_active": len(self._agents),
        }


# Module-level singleton
_registry: AgentRegistry | None = None


def get_registry() -> AgentRegistry:
    """Get the global AgentRegistry singleton."""
    global _registry
    if _registry is None:
        _registry = AgentRegistry()
    return _registry
