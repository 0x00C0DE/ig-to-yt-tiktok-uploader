"""Guard and retry TikTokAutoUploader's upload-endpoint initialization."""
from __future__ import annotations

import time
from collections.abc import Callable


class TikTokUploadInitializationError(RuntimeError):
    """TikTok did not provide the endpoint data required to upload a video."""


class _RetryableUploadResponseError(RuntimeError):
    pass


def clone_requests_session(source):
    """Create a new requests session carrying only the current authenticated state."""
    try:
        fresh = source.__class__()
    except Exception:
        import requests
        fresh = requests.Session()
    fresh.headers.update(source.headers)
    fresh.cookies.update(source.cookies)
    fresh.proxies.update(source.proxies)
    fresh.verify = source.verify
    if hasattr(source, "auth"):
        fresh.auth = source.auth
    return fresh


def _validated_upload(result):
    if not isinstance(result, (tuple, list)) or len(result) != 8:
        raise _RetryableUploadResponseError("incomplete upload result")

    video_id, session_key, upload_id, crcs, upload_host, store_uri, video_auth, aws_auth = result
    required = (video_id, session_key, upload_id, upload_host, store_uri, video_auth, aws_auth)
    if not all(required) or not isinstance(crcs, (tuple, list)) or not crcs:
        raise _RetryableUploadResponseError("missing upload endpoint fields")
    return result


def build_upload_initializer_with_retry(
    upload_initializer: Callable,
    *,
    attempts: int = 3,
    delay_seconds: float = 1.0,
    session_factory: Callable = clone_requests_session,
    sleep: Callable = time.sleep,
    logger: Callable = print,
):
    """Wrap an upstream initializer with response validation and fresh-session retries."""
    if attempts < 1:
        raise ValueError("attempts must be at least 1")

    def resilient_upload_initializer(video_file, session):
        for attempt_index in range(attempts):
            active_session = session if attempt_index == 0 else session_factory(session)
            try:
                result = _validated_upload(upload_initializer(video_file, active_session))
            except (IndexError, KeyError, TypeError, ValueError, _RetryableUploadResponseError):
                if attempt_index + 1 >= attempts:
                    break
                logger(
                    "TikTok returned no usable upload endpoint "
                    f"(attempt {attempt_index + 1}/{attempts}); retrying with a fresh session."
                )
                if delay_seconds > 0:
                    sleep(delay_seconds)
                continue

            if active_session is not session:
                session.cookies.update(active_session.cookies)
            return result

        raise TikTokUploadInitializationError(
            f"TikTok returned no usable upload endpoint after {attempts} attempts"
        )

    return resilient_upload_initializer
