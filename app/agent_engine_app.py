# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
import logging
import os
from typing import Any

import vertexai
from a2a.types import AgentCapabilities, AgentCard, AgentSkill, TransportProtocol
from dotenv import load_dotenv
from google.adk.a2a.executor.a2a_agent_executor import A2aAgentExecutor
from google.adk.artifacts import GcsArtifactService, InMemoryArtifactService
from google.adk.runners import Runner
from vertexai.preview.reasoning_engines import A2aAgent

from app.agent import app as adk_app
from app.app_utils.session_service import get_session_service
from app.app_utils.telemetry import setup_telemetry
from app.app_utils.typing import Feedback

# Load environment variables from .env file at runtime
load_dotenv()


def _is_integration_test() -> bool:
    return os.getenv("INTEGRATION_TEST", "").lower() in {"1", "true", "yes"}


def _build_agent_card() -> AgentCard:
    """Build the AgentCard synchronously (no asyncio needed)."""
    agent = adk_app.root_agent

    agent_card = AgentCard(
        name=agent.name,
        description=agent.description or "LorePack collaborative worldbuilding agent",
        url="http://localhost:9999/",
        version=os.getenv("AGENT_VERSION", "0.1.0"),
        capabilities=AgentCapabilities(streaming=False),
        default_input_modes=["text/plain"],
        default_output_modes=["text/plain"],
        supports_authenticated_extended_card=True,
        preferred_transport=TransportProtocol.http_json,
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
                    "Can conjure a new story world from genre, era, and protagonist parameters, "
                    "then generate illustrated chapters grounded in lorebook entries via RAG. "
                    "Uses Gemini interleaved output for inline scene illustrations. "
                    "Supports configurable chapter length and writing style."
                ),
                tags=[
                    "story",
                    "chapter",
                    "generation",
                    "illustration",
                    "RAG",
                    "narrative",
                ],
                examples=[
                    "Conjure a dark fantasy world with a warrior protagonist",
                    "Generate Chapter 2 of the ongoing story",
                    "Continue the story with an epic battle scene",
                ],
            ),
        ],
    )
    return agent_card


def _create_runner() -> Runner:
    """Create a Runner for the A2A executor."""
    logs_bucket_name = os.environ.get("LOGS_BUCKET_NAME")
    session_service = get_session_service(logger=logging.getLogger("lorepack.agent_engine"))
    return Runner(
        app=adk_app,
        session_service=session_service,
        artifact_service=(
            GcsArtifactService(bucket_name=logs_bucket_name)
            if logs_bucket_name
            else InMemoryArtifactService()
        ),
    )


class AgentEngineApp(A2aAgent):
    """LorePack Agent Engine application with A2A protocol support."""

    def set_up(self) -> None:
        """Initialize the agent engine app with logging and telemetry."""
        integration_test_mode = _is_integration_test()

        if not integration_test_mode:
            vertexai.init()
            setup_telemetry()

        super().set_up()
        logging.basicConfig(level=logging.INFO)

        if integration_test_mode:
            self.logger = logging.getLogger(__name__)
        else:
            from google.cloud import logging as google_cloud_logging

            logging_client = google_cloud_logging.Client()
            self.logger = logging_client.logger(__name__)

    def register_feedback(self, feedback: dict[str, Any]) -> None:
        """Collect and log feedback."""
        feedback_obj = Feedback.model_validate(feedback)
        self.logger.log_struct(feedback_obj.model_dump(), severity="INFO")

    def register_operations(self) -> dict[str, list[str]]:
        """Registers the operations of the Agent."""
        operations = super().register_operations()
        operations[""] = [*operations.get("", []), "register_feedback"]
        return operations

    def clone(self) -> "AgentEngineApp":
        """Returns a clone of the Agent Engine application."""
        return self


agent_engine = AgentEngineApp(
    agent_executor_builder=lambda: A2aAgentExecutor(runner=_create_runner()),
    agent_card=_build_agent_card(),
)
