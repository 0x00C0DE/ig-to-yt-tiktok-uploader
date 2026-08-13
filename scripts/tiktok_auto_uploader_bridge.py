"""Small process boundary for makiisthenes/TiktokAutoUploader.

The upstream upload function returns None on its current success path, so this
adapter converts its explicit "Published successfully" output into a reliable
process exit status for the Node upload manager.
"""
from __future__ import annotations

import argparse
import contextlib
import io
import os
import sys


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser()
    result.add_argument("--repo", required=True)
    result.add_argument("--session", required=True)
    result.add_argument("--video", required=True)
    result.add_argument("--caption", required=True)
    result.add_argument("--visibility", type=int, default=0)
    result.add_argument("--allow-comment", type=int, default=1)
    result.add_argument("--allow-duet", type=int, default=0)
    result.add_argument("--allow-stitch", type=int, default=0)
    result.add_argument("--brand-organic", type=int, default=0)
    result.add_argument("--branded-content", type=int, default=0)
    result.add_argument("--ai-label", type=int, default=0)
    result.add_argument("--proxy-env")
    return result


def main() -> int:
    args = parser().parse_args()
    repo = os.path.abspath(args.repo)
    os.chdir(repo)
    sys.path.insert(0, repo)
    try:
        from tiktok_uploader.Config import Config
        config_path = os.path.join(repo, "config.txt")
        if os.path.exists(config_path):
            Config.load(config_path)
        from tiktok_uploader import tiktok
        from tiktok_caption import convert_tags_resilient
        tiktok.convert_tags = convert_tags_resilient
    except Exception as error:
        print(f"TikTokAutoUploader dependency/import failure: {error}", file=sys.stderr)
        return 3

    output = io.StringIO()
    try:
        with contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
            result = tiktok.upload_video(
                args.session, args.video, args.caption, 0,
                args.allow_comment, args.allow_duet, args.allow_stitch,
                args.visibility, args.brand_organic, args.branded_content,
                args.ai_label, os.environ.get(args.proxy_env, "") if args.proxy_env else ""
            )
    except SystemExit as error:
        print(output.getvalue(), end="", file=sys.stderr)
        return int(error.code or 1)
    except Exception as error:
        print(output.getvalue(), end="", file=sys.stderr)
        print(f"TikTokAutoUploader exception: {error}", file=sys.stderr)
        return 4

    text = output.getvalue()
    print(text, end="")
    if result is True or "Published successfully" in text:
        return 0
    print("TikTokAutoUploader did not confirm publication", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
