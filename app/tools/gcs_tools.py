# GCS storage tools
# Upload, signed URL generation, and asset listing for the lorepack-assets bucket

import json
from datetime import timedelta

from google.cloud import storage

_BUCKET_NAME = "lorepack-assets-gemini-hack"


def _get_bucket():
    """Lazy-init storage bucket to avoid blocking module import."""
    client = storage.Client()
    return client.bucket(_BUCKET_NAME)


def upload_image(image_bytes: bytes, path: str) -> str:
    """Upload image bytes to GCS and return the gs:// URI.

    Args:
        image_bytes: Raw image bytes to upload.
        path: Object path within the bucket, e.g. "characters/aria.png".

    Returns:
        The gs:// URI of the uploaded object.
    """
    blob = _get_bucket().blob(path)
    blob.upload_from_string(image_bytes, content_type="image/png")
    return f"gs://{_BUCKET_NAME}/{path}"


def get_signed_url(gs_uri: str) -> str:
    """Generate a signed URL (1 hour expiry) for a GCS object.

    Args:
        gs_uri: The gs:// URI of the object.

    Returns:
        A signed HTTPS URL valid for 1 hour.
    """
    path = gs_uri.replace(f"gs://{_BUCKET_NAME}/", "")
    blob = _get_bucket().blob(path)
    url = blob.generate_signed_url(expiration=timedelta(hours=1))
    return url


def list_assets(prefix: str) -> str:
    """List objects under a prefix in the assets bucket.

    Args:
        prefix: Object prefix to filter by, e.g. "characters/" or "scenes/".

    Returns:
        JSON string containing a list of object names and sizes.
    """
    client = storage.Client()
    blobs = client.list_blobs(_BUCKET_NAME, prefix=prefix)
    assets = [
        {
            "name": blob.name,
            "size": blob.size,
            "updated": blob.updated.isoformat() if blob.updated else None,
        }
        for blob in blobs
    ]
    return json.dumps(assets, ensure_ascii=False, indent=2)
