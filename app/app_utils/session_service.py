"""Session service factory with persistent-by-default configuration."""

import logging
import os

from google.adk.sessions import (
    BaseSessionService,
    DatabaseSessionService,
    InMemorySessionService,
)

_DEFAULT_SESSION_DB_URL = "sqlite:////tmp/lorepack_sessions.db"


def _is_integration_test() -> bool:
    return os.getenv("INTEGRATION_TEST", "").lower() in {"1", "true", "yes", "on"}


def get_session_service(
    db_url: str | None = None,
    logger: logging.Logger | None = None,
) -> BaseSessionService:
    """Return a session service, preferring persistent DB-backed storage."""
    if _is_integration_test():
        if logger:
            logger.info("Using InMemorySessionService (integration test mode).")
        return InMemorySessionService()

    resolved_db_url = (db_url or os.getenv("LOREPACK_SESSION_DB_URL", "")).strip()
    if not resolved_db_url:
        resolved_db_url = _DEFAULT_SESSION_DB_URL

    try:
        service = DatabaseSessionService(db_url=resolved_db_url)
        if logger:
            logger.info("Using DatabaseSessionService with db_url=%s", resolved_db_url)
        return service
    except Exception:
        if logger:
            logger.exception(
                "Failed to initialize DatabaseSessionService (db_url=%s). "
                "Falling back to InMemorySessionService.",
                resolved_db_url,
            )
        return InMemorySessionService()
