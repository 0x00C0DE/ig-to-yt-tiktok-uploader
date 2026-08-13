# Third-party notices

## TikTokAutoUploader

This project can invoke [makiisthenes/TiktokAutoUploader](https://github.com/makiisthenes/TiktokAutoUploader) through an optional adapter. The installer pins upstream revision `d29b4366edf0de705e87f265298a06b64a00d7dc` and applies a small compatibility patch so its current posting payload honors the configured visibility, comment, duet, and stitch values. TikTokAutoUploader is distributed under the MIT License; its complete license remains in the installed `.vendor/TiktokAutoUploader/LICENSE` file.

The integration does not vendor TikTokAutoUploader source code into this repository. It provides a process adapter, configuration mapping, validation, result handling, and an installer for the pinned upstream revision.
