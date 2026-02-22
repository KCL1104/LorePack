# LorePack - Collaborative Worldbuilding & Story Generation Platform
# Root Agent: Orchestrator that dispatches user requests to specialized sub-agents

import os

import google.auth
from google.adk.agents import Agent
from google.adk.apps import App
from google.adk.models import Gemini
from google.adk.tools import LongRunningFunctionTool
from google.genai import types

from app.agents.collaboration import collaboration_agent
from app.agents.narrative_director import narrative_director_agent
from app.agents.visual_artist import visual_artist_agent
from app.agents.world_architect import world_architect_agent

_, project_id = google.auth.default()
os.environ["GOOGLE_CLOUD_PROJECT"] = project_id
os.environ["GOOGLE_CLOUD_LOCATION"] = "global"
os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "True"


def request_user_input(message: str) -> dict:
    """Request additional input from the user.

    Use this tool when you need more information from the user to complete a task.
    Calling this tool will pause execution until the user responds.

    Args:
        message: The question or clarification request to show the user.
    """
    return {"status": "pending", "message": message}


ROOT_AGENT_INSTRUCTION = """\
You are the Root Orchestrator of the LorePack platform. Your role is to understand user intent
and dispatch tasks to the most appropriate specialized sub-agent.

## Available Sub-Agents

1. **world_architect** (World Architect)
   - Create and manage lorebooks
   - Add entries for characters, locations, magic systems, etc.
   - Validate logical consistency of lore settings
   - Use when: the user wants to manually create or modify worldbuilding settings

2. **narrative_director** (Narrative Director)
   - Conjure new worlds from genre/era/protagonist parameters (story session flow)
   - Generate story chapters based on lorebooks
   - Auto-populate lorebook entries as the story evolves
   - Plot development and character dialogue simulation
   - Use when: the user wants to conjure a new story session, generate story content, continue a plot, or simulate character interactions

3. **visual_artist** (Visual Artist)
   - Generate character portraits and scene concept art
   - Use when: the user wants to generate images for characters or scenes

4. **collaboration** (Collaboration Agent)
   - Handle cross-user worldbuilding sharing
   - Use when: the user wants to share or import lorebooks from other users

## Story Session Flow
When the frontend sends a conjure request with session parameters (genre, world_era, world_essence,
protagonist_archetype, protagonist_virtues, protagonist_shadow, spark), dispatch to the
**narrative_director**. The Narrative Director will:
1. Create the world concept and protagonist from the parameters
2. Auto-create lorebook entries for all invented entities
3. Present the world to the user and await further direction

## Dispatch Rules
- Carefully analyze the user's intent and select the most appropriate sub-agent.
- If a task involves multiple sub-agents, dispatch them in logical order.
- If the intent is unclear, use the request_user_input tool to ask the user for clarification.
- Always respond to the user in their preferred language.
"""

root_agent = Agent(
    name="root_agent",
    model=Gemini(
        model="gemini-3-flash-preview",
        retry_options=types.HttpRetryOptions(attempts=3),
    ),
    description="Root orchestrator for the LorePack collaborative worldbuilding and story generation platform.",
    instruction=ROOT_AGENT_INSTRUCTION,
    sub_agents=[
        world_architect_agent,
        narrative_director_agent,
        visual_artist_agent,
        collaboration_agent,
    ],
    tools=[
        LongRunningFunctionTool(func=request_user_input),
    ],
)

app = App(
    root_agent=root_agent,
    name="app",
)
