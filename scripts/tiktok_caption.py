"""Resilient caption markup for the pinned TikTokAutoUploader adapter."""
from __future__ import annotations

import re


USER_MARKER = 'webapp.user-detail":{"userInfo":{"user":{"id":"'
TOKEN_PATTERN = re.compile(r"#(\w+)|@([\w.-]+)|([^#@]+)|([#@])")


def _resolve_user_id(session, username: str) -> str:
    try:
        response = session.request(
            "GET",
            "https://www.tiktok.com/@" + username,
            headers={
                "accept": "*/*",
                "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
            },
        )
        parts = response.text.split(USER_MARKER, 1)
        return parts[1].split('"', 1)[0] if len(parts) == 2 else ""
    except Exception:
        return ""


def convert_tags_resilient(text, session):
    """Preserve unresolved mentions as text instead of raising IndexError."""
    cursor = 0
    tag_id = -1
    text_extra = []

    def convert(match):
        nonlocal cursor, tag_id
        hashtag, username, ordinary, lone_marker = match.groups()
        if ordinary is not None or lone_marker is not None:
            value = ordinary if ordinary is not None else lone_marker
            cursor += len(value)
            return value

        tag_id += 1
        value = match.group(0)
        start = cursor
        cursor += len(value)
        if hashtag is not None:
            text_extra.append({
                "end": cursor,
                "hashtag_name": hashtag,
                "start": start,
                "tag_id": str(tag_id),
                "type": 1,
                "user_id": "",
            })
            return f'<h id="{tag_id}">#{hashtag}</h>'

        user_id = _resolve_user_id(session, username)
        if not user_id:
            return value
        text_extra.append({
            "end": cursor,
            "hashtag_name": "",
            "start": start,
            "tag_id": str(tag_id),
            "type": 0,
            "user_id": user_id,
        })
        return f'<m id="{tag_id}">@{username}</m>'

    return TOKEN_PATTERN.sub(convert, text), text_extra
