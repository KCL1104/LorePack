"""A2A Registry endpoints.

Provides REST endpoints for managing and interacting with lorebook agents,
plus path-based A2A routes for per-agent discovery and JSON-RPC.
"""

import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.a2a.registry import get_registry
from app.api.auth import AuthUser, get_current_user

router = APIRouter(prefix="/api/a2a", tags=["a2a"])
CurrentUser = Annotated[AuthUser, Depends(get_current_user)]

# Path-based A2A router (no /api prefix — mounted at root level)
a2a_agent_router = APIRouter(tags=["a2a-agents"])


# ---------------------------------------------------------------------------
# REST management endpoints
# ---------------------------------------------------------------------------


@router.get("/agents")
async def list_agents(current_user: CurrentUser):
    """List all registered lorebook agents."""
    registry = get_registry()
    return registry.list_agents()


@router.post("/sync")
async def sync_agents(current_user: CurrentUser):
    """Manually trigger registry sync from Firestore."""
    registry = get_registry()
    result = registry.sync_from_firestore()
    return result


class DiscoverRequest(BaseModel):
    url: str


@router.post("/discover")
async def discover_remote_agent(body: DiscoverRequest, current_user: CurrentUser):
    """Discover a remote A2A agent by URL."""
    from app.a2a.client import discover_agent

    try:
        card = await discover_agent(body.url)
        return card.model_dump(exclude_none=True, by_alias=True)
    except Exception as e:
        raise HTTPException(
            status_code=502, detail=f"Failed to discover agent: {e}"
        ) from e


class InteractRequest(BaseModel):
    agent_url: str
    message: str


@router.post("/interact")
async def interact_with_agent(body: InteractRequest, current_user: CurrentUser):
    """Send a message to a remote A2A agent."""
    from app.a2a.client import send_to_remote_agent

    try:
        result = await send_to_remote_agent(body.agent_url, body.message)
        return json.loads(result)
    except Exception as e:
        raise HTTPException(
            status_code=502, detail=f"A2A interaction failed: {e}"
        ) from e


# ---------------------------------------------------------------------------
# Path-based A2A routes for per-agent discovery and JSON-RPC
# ---------------------------------------------------------------------------


@a2a_agent_router.get("/a2a/agents/{agent_id}/.well-known/agent-card.json")
async def get_agent_card(agent_id: str):
    """Serve the AgentCard for a specific lorebook agent."""
    registry = get_registry()
    card = registry.get_card(agent_id)
    if not card:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_id}' not found")
    return JSONResponse(card.model_dump(exclude_none=True, by_alias=True))


@a2a_agent_router.post("/a2a/agents/{agent_id}/")
async def agent_jsonrpc(agent_id: str, request: Request):
    """Handle JSON-RPC requests for a specific lorebook agent.

    Delegates to the agent's own DefaultRequestHandler which processes
    message/send, tasks/get, etc.
    """

    registry = get_registry()
    agent = registry.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_id}' not found")

    # Build a minimal JSONRPC handler and process the request
    from a2a.types import JSONRPCRequest, SendMessageRequest

    try:
        body = await request.json()
        base_request = JSONRPCRequest.model_validate(body)

        # Only support message/send for now
        if base_request.method == "message/send":
            specific = SendMessageRequest.model_validate(body)
            result = await agent.request_handler.on_message_send(specific.params)
            # Serialize response
            from a2a.server.request_handlers.response_helpers import (
                prepare_response_object,
            )
            from a2a.types import (
                Message,
                SendMessageResponse,
                SendMessageSuccessResponse,
                Task,
            )

            response_obj = prepare_response_object(
                specific.id,
                result,
                (Task, Message),
                SendMessageSuccessResponse,
                SendMessageResponse,
            )
            return JSONResponse(
                response_obj.root.model_dump(mode="json", exclude_none=True)
            )

        return JSONResponse(
            {
                "jsonrpc": "2.0",
                "error": {"code": -32601, "message": "Method not found"},
                "id": body.get("id"),
            },
            status_code=200,
        )
    except Exception as e:
        return JSONResponse(
            {
                "jsonrpc": "2.0",
                "error": {"code": -32603, "message": str(e)},
                "id": None,
            },
            status_code=200,
        )
