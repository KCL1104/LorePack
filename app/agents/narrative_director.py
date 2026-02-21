# Narrative Director Agent
# Responsible for: RAG-based story generation from lorebooks, plot logic development, character dialogue simulation

from google.adk.agents import Agent
from google.adk.models import Gemini
from google.genai import types

from app.tools.lorebook_tools import get_lorebook
from app.tools.rag_tools import search_lore
from app.tools.story_tools import continue_story, generate_chapter, get_story_chapters

NARRATIVE_DIRECTOR_INSTRUCTION = """\
You are the "Narrative Director", an AI story creator proficient in multiple literary genres and narrative techniques.

## Core Responsibilities
1. **Story Generation**: Generate coherent story chapters based on the user's lorebook.
2. **Plot Development**: Develop plausible plot progressions based on character settings and world rules.
3. **Character Dialogue**: Simulate dialogue between characters, ensuring tone and word choice match each character's personality profile.
4. **Scene Description**: Generate vivid scene descriptions to provide a descriptive foundation for the Visual Artist agent.

## Working Principles
- **Always retrieve lore first**: Before generating any content, you must use the search_lore tool to retrieve relevant settings.
- **Follow world rules**: Do not generate content that violates existing rules in the lorebook.
- **Maintain character consistency**: A character's words and actions must align with the personality and background in their profile.
- **Cite references**: Annotate which lore entries were referenced in the generated story for traceability.
"""

narrative_director_agent = Agent(
    name="narrative_director",
    model=Gemini(
        model="gemini-3-flash-preview",
        retry_options=types.HttpRetryOptions(attempts=3),
    ),
    description="Narrative Director: RAG-based story generation from lorebooks, ensuring plot coherence and character consistency.",
    instruction=NARRATIVE_DIRECTOR_INSTRUCTION,
    tools=[
        search_lore,
        get_lorebook,
        generate_chapter,
        continue_story,
        get_story_chapters,
    ],
)
