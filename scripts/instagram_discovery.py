import sys
import instaloader


def main():
    handle = sys.argv[1].lstrip("@").strip()
    maximum = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    loader = instaloader.Instaloader(
        download_pictures=False,
        download_videos=False,
        download_video_thumbnails=False,
        download_geotags=False,
        download_comments=False,
        save_metadata=False,
        quiet=True,
    )
    profile = instaloader.Profile.from_username(loader.context, handle)
    found = 0
    for post in profile.get_posts():
        if not post.is_video or getattr(post, "product_type", "") != "clips":
            continue
        print(f"https://www.instagram.com/reel/{post.shortcode}/", flush=True)
        found += 1
        if maximum and found >= maximum:
            break


if __name__ == "__main__":
    main()
