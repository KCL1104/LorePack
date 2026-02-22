"""Shared dependencies for API routers."""

from functools import lru_cache

from google.cloud import firestore


@lru_cache(maxsize=1)
def get_firestore_client() -> firestore.Client:
    """Cached Firestore client singleton."""
    return firestore.Client()
