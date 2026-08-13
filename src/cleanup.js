import fs from "node:fs";
import path from "node:path";

export async function removeUploadedVideo({ cwd, downloadDirectory, videoPath }) {
  const root = path.resolve(cwd, downloadDirectory);
  const target = path.resolve(videoPath);
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to delete video outside the download directory: ${target}`);
  }
  try {
    await fs.promises.unlink(target);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}
