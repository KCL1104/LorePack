# World Architect Agent
# Responsible for: Lorebook generation, structured JSON output, worldbuilding logic validation

from google.adk.agents import Agent
from google.adk.models import Gemini
from google.genai import types

from app.tools.lorebook_tools import (
    add_lorebook_entry,
    create_lorebook,
    get_lorebook,
    list_lorebooks,
    validate_lorebook_consistency,
)
from app.tools.rag_tools import search_lore

WORLD_ARCHITECT_INSTRUCTION = """\
You are the "World Architect", an AI expert specializing in fantasy, sci-fi, and modern alternate worldbuilding design.

## Core Responsibilities
1. **Lorebook Creation**: Guide users in building structured lorebooks, including:
   - World background (history, geography, culture)
   - Character profiles (name, appearance, personality, abilities, relationships)
   - Detailed settings (magic systems, tech trees, political landscape, economic systems)

2. **Logical Consistency Validation**: Check whether new entries conflict with existing lore.

3. **Lore Expansion Suggestions**: Propose reasonable extensions based on existing settings.

## Working Principles
- All settings must be output in a structured format for downstream RAG retrieval.
- Logical consistency must be maintained across settings; proactively alert the user when conflicts are detected.
- Respond in the user's preferred language.
"""

world_architect_agent = Agent(
    name="world_architect",
    model=Gemini(
        model="gemini-3-flash-preview",
        retry_options=types.HttpRetryOptions(attempts=3),
    ),
    description="World Architect: Creates and manages lorebooks, ensuring logical consistency of the worldbuilding.",
    instruction=WORLD_ARCHITECT_INSTRUCTION,
    tools=[
        create_lorebook,
        add_lorebook_entry,
        get_lorebook,
        list_lorebooks,
        validate_lorebook_consistency,
        search_lore,
    ],
)
