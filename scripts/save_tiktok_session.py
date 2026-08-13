#!/usr/bin/env python3
import argparse
import json
import os
import pickle
import tempfile
import sys


REQUIRED = ("sessionid", "tt-target-idc")


def main():
    parser = argparse.ArgumentParser(description="Persist a minimal TikTokAutoUploader session")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    payload = json.load(sys.stdin)
    supplied = payload.get("cookies") if isinstance(payload, dict) else None
    if not isinstance(supplied, list):
        raise ValueError("cookies must be a list")

    by_name = {
        cookie.get("name"): cookie
        for cookie in supplied
        if isinstance(cookie, dict) and cookie.get("name") in REQUIRED and cookie.get("value")
    }
    missing = [name for name in REQUIRED if name not in by_name]
    if missing:
        raise ValueError("missing required TikTok session cookies: " + ", ".join(missing))

    cookies = [by_name[name] for name in REQUIRED]
    output = os.path.abspath(args.output)
    directory = os.path.dirname(output)
    os.makedirs(directory, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=".tiktok-session-", suffix=".tmp", dir=directory)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            pickle.dump(cookies, handle)
        os.replace(temporary, output)
    finally:
        if os.path.exists(temporary):
            os.remove(temporary)

    print(json.dumps({"ok": True, "cookie_names": list(REQUIRED)}))


if __name__ == "__main__":
    main()
