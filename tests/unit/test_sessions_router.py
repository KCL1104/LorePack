"""Unit tests for story session router delete cascade behavior."""

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app.api.routers import sessions as sessions_router


def _build_mock_db(*, lorebook_owner_uid: str):
    db = MagicMock()

    stories_col = MagicMock()
    lorebooks_col = MagicMock()
    sessions_col = MagicMock()

    db.collection.side_effect = lambda name: {
        "stories": stories_col,
        "lorebooks": lorebooks_col,
        "story_sessions": sessions_col,
    }[name]

    stories_doc = MagicMock()
    stories_col.document.return_value = stories_doc
    stories_chapters_col = MagicMock()
    stories_doc.collection.return_value = stories_chapters_col
    chapter_snap = MagicMock()
    stories_chapters_col.stream.return_value = [chapter_snap]

    lorebook_doc = MagicMock()
    lorebooks_col.document.return_value = lorebook_doc
    lorebook_snap = MagicMock()
    lorebook_snap.exists = True
    lorebook_snap.to_dict.return_value = {"owner_uid": lorebook_owner_uid}
    lorebook_doc.get.return_value = lorebook_snap
    lorebook_entries_col = MagicMock()
    lorebook_doc.collection.return_value = lorebook_entries_col
    entry_snap = MagicMock()
    lorebook_entries_col.stream.return_value = [entry_snap]

    session_doc = MagicMock()
    sessions_col.document.return_value = session_doc

    return {
        "db": db,
        "stories_doc": stories_doc,
        "chapter_snap": chapter_snap,
        "lorebook_doc": lorebook_doc,
        "entry_snap": entry_snap,
        "session_doc": session_doc,
    }


@pytest.mark.asyncio
async def test_delete_session_deletes_owned_lorebook(monkeypatch):
    session_id = "sess-1"
    lorebook_id = "lb-1"
    owner_uid = "user-1"
    mocked = _build_mock_db(lorebook_owner_uid=owner_uid)

    monkeypatch.setattr(sessions_router, "get_firestore_client", lambda: mocked["db"])
    monkeypatch.setattr(
        sessions_router,
        "_require_owned_session",
        lambda _db, _session_id, _owner_uid: {"id": session_id, "lorebook_id": lorebook_id},
    )

    result = await sessions_router.delete_session(session_id, SimpleNamespace(uid=owner_uid))

    assert result == {"deleted": session_id}
    mocked["chapter_snap"].reference.delete.assert_called_once()
    mocked["stories_doc"].delete.assert_called_once()
    mocked["entry_snap"].reference.delete.assert_called_once()
    mocked["lorebook_doc"].delete.assert_called_once()
    mocked["session_doc"].delete.assert_called_once()


@pytest.mark.asyncio
async def test_delete_session_skips_unowned_lorebook(monkeypatch):
    session_id = "sess-2"
    lorebook_id = "lb-2"
    owner_uid = "user-1"
    mocked = _build_mock_db(lorebook_owner_uid="another-user")

    monkeypatch.setattr(sessions_router, "get_firestore_client", lambda: mocked["db"])
    monkeypatch.setattr(
        sessions_router,
        "_require_owned_session",
        lambda _db, _session_id, _owner_uid: {"id": session_id, "lorebook_id": lorebook_id},
    )

    result = await sessions_router.delete_session(session_id, SimpleNamespace(uid=owner_uid))

    assert result == {"deleted": session_id}
    mocked["chapter_snap"].reference.delete.assert_called_once()
    mocked["stories_doc"].delete.assert_called_once()
    mocked["entry_snap"].reference.delete.assert_not_called()
    mocked["lorebook_doc"].delete.assert_not_called()
    mocked["session_doc"].delete.assert_called_once()
