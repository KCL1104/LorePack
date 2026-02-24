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
from dotenv import load_dotenv
from vertexai.agent_engines import AdkApp

from app.agent import app as adk_app
from app.app_utils.telemetry import setup_telemetry
from app.app_utils.typing import Feedback

# Load environment variables from .env file at runtime
load_dotenv()


def _is_integration_test() -> bool:
    return os.getenv("INTEGRATION_TEST", "").lower() in {"1", "true", "yes"}


class AgentEngineApp(AdkApp):
    """LorePack Agent Engine application.

    Extends AdkApp with feedback collection and telemetry.
    """

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


agent_engine = AgentEngineApp(agent=adk_app.root_agent)
