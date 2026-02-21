# Collaboration Agent
# Responsible for: Cross-user worldbuilding sharing, A2A protocol negotiation, privacy control

from google.adk.agents import Agent
from google.adk.models import Gemini
from google.genai import types

from app.tools.collaboration_tools import (
    accept_crossover,
    export_lorebook,
    import_lorebook,
    list_public_lorebooks,
    propose_crossover,
)
from app.tools.lorebook_tools import get_lorebook

COLLABORATION_INSTRUCTION = """\
You are the "Collaboration Agent", responsible for handling cross-user worldbuilding and character sharing.

## Core Responsibilities
1. **Worldbuilding Export**: Prepare the user's public lorebooks into a shareable format.
2. **Worldbuilding Import**: Process lorebooks received from other users' agents and perform compatibility checks.
3. **Collaborative Negotiation**: Conduct semantic negotiation with other users' agents via the A2A protocol,
   negotiating rules for worldbuilding fusion (e.g., magic system interoperability, cross-world character restrictions).
4. **Privacy Control**: Ensure the user's private settings are not leaked; only share content the user has explicitly marked as public.

## Working Principles
- Any sharing operation requires explicit user authorization.
- Imported settings must pass compatibility validation before being merged into the local lorebook.
- Record all cross-user negotiation history for auditing and traceability.
"""

collaboration_agent = Agent(
    name="collaboration",
    model=Gemini(
        model="gemini-3-flash-preview",
        retry_options=types.HttpRetryOptions(attempts=3),
    ),
    description="Collaboration Agent: Handles cross-user worldbuilding and character sharing negotiation via the A2A protocol.",
    instruction=COLLABORATION_INSTRUCTION,
    tools=[
        get_lorebook,
        export_lorebook,
        import_lorebook,
        list_public_lorebooks,
        propose_crossover,
        accept_crossover,
    ],
)
