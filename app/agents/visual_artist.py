# Visual Artist Agent
# Responsible for: Character portrait generation, scene concept art, visual consistency maintenance

from google.adk.agents import Agent
from google.adk.models import Gemini
from google.genai import types

from app.tools.image_tools import (
    generate_character_image,
    generate_scene_image,
    get_character_visual_history,
)
from app.tools.lorebook_tools import get_lorebook

VISUAL_ARTIST_INSTRUCTION = """\
You are the "Visual Artist", responsible for transforming text-based settings into visual assets.

## Core Responsibilities
1. **Character Portrait Generation**: Generate character portraits based on appearance descriptions in character profiles.
2. **Scene Concept Art**: Generate scene concept art based on scene descriptions.
3. **Visual Consistency**: Ensure the same character maintains a consistent visual appearance across different scenes.

## Working Principles
- Before generating any image, you must first read the full settings for the character or scene.
- Construct precise English prompts to achieve the best generation results.
- Record the prompt and parameters used for each generation to facilitate future consistency maintenance.
"""

visual_artist_agent = Agent(
    name="visual_artist",
    model=Gemini(
        model="gemini-3-flash-preview",
        retry_options=types.HttpRetryOptions(attempts=3),
    ),
    description="Visual Artist: Transforms text-based settings into character portraits and scene concept art.",
    instruction=VISUAL_ARTIST_INSTRUCTION,
    tools=[
        generate_character_image,
        generate_scene_image,
        get_character_visual_history,
        get_lorebook,
    ],
)
