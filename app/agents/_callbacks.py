"""Shared agent callbacks.

Provides reusable error-handling callbacks for all LorePack agents.
"""

import logging

_logger = logging.getLogger("lorepack.agent")


def on_tool_error(callback_context, tool, args, error):
    """Log tool errors and return a graceful message to the agent."""
    tool_name = getattr(tool, "name", str(tool))
    _logger.error(
        "[ADK] tool_error agent=%s tool=%s args=%s error=%s",
        getattr(callback_context, "agent_name", "?"),
        tool_name,
        args,
        error,
    )
    return {"error": f"Tool '{tool_name}' failed: {error}. Please try again."}


def on_model_error(callback_context, error):
    """Log LLM errors and let ADK retry."""
    _logger.error(
        "[ADK] model_error agent=%s error=%s",
        getattr(callback_context, "agent_name", "?"),
        error,
    )
    return None
