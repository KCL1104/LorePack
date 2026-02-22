"""Per-request user context helpers for tool-layer ownership scoping."""

import os
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar, Token

_current_user_uid: ContextVar[str | None] = ContextVar("current_user_uid", default=None)


@contextmanager
def scoped_user(user_uid: str | None) -> Iterator[None]:
    """Temporarily set current user UID for nested tool calls."""
    token: Token[str | None] = _current_user_uid.set(user_uid)
    try:
        yield
    finally:
        _current_user_uid.reset(token)


def current_user_uid() -> str | None:
    """Return the current user UID from context, if present."""
    value = _current_user_uid.get()
    if value:
        return value

    fallback = os.getenv("LOREPACK_DEFAULT_OWNER_UID", "").strip()
    return fallback or None


def resolve_owner_uid(owner_uid: str | None = None) -> str:
    """Resolve owner UID from explicit value, context, or fallback env."""
    if owner_uid and owner_uid.strip():
        return owner_uid.strip()

    context_uid = current_user_uid()
    if context_uid:
        return context_uid

    return "legacy-owner"
