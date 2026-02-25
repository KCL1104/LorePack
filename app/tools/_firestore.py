"""Shared singleton clients for Firestore and GenAI.

All tool modules should import from here instead of creating their own
lazy singletons, to avoid unnecessary duplicate connections.
"""

import os

_cached_db = None
_cached_genai = None
_cached_imagen_genai = None


def get_db():
    """Shared Firestore client singleton."""
    global _cached_db
    if _cached_db is None:
        from google.cloud import firestore

        _cached_db = firestore.Client()
    return _cached_db


def get_genai_client():
    """Shared GenAI client singleton (location=global, for text/embedding)."""
    global _cached_genai
    if _cached_genai is None:
        from google import genai

        db = get_db()
        _cached_genai = genai.Client(
            vertexai=True, project=db.project, location="global"
        )
    return _cached_genai


def get_imagen_client():
    """Shared GenAI client singleton for Imagen (location configurable)."""
    global _cached_imagen_genai
    if _cached_imagen_genai is None:
        import google.auth
        from google import genai

        _, project = google.auth.default()
        _cached_imagen_genai = genai.Client(
            vertexai=True,
            project=project,
            location=os.environ.get("IMAGEN_LOCATION", "us-central1"),
        )
    return _cached_imagen_genai
