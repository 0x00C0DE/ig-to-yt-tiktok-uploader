import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { removeUploadedVideo } from "../src/cleanup.js";

test("deletes a completed video inside the configured download directory", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "reel-cleanup-"));
  const directory = path.join(cwd, "downloads");
  fs.mkdirSync(directory);
  const videoPath = path.join(directory, "REEL123.mp4");
  fs.writeFileSync(videoPath, "video");
  assert.equal(await removeUploadedVideo({ cwd, downloadDirectory: "downloads", videoPath }), true);
  assert.equal(fs.existsSync(videoPath), false);
  fs.rmSync(cwd, { recursive: true, force: true });
});

test("refuses to delete a file outside the configured download directory", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "reel-cleanup-"));
  const videoPath = path.join(cwd, "outside.mp4");
  fs.writeFileSync(videoPath, "video");
  await assert.rejects(
    removeUploadedVideo({ cwd, downloadDirectory: "downloads", videoPath }),
    /Refusing to delete/
  );
  assert.equal(fs.existsSync(videoPath), true);
  fs.rmSync(cwd, { recursive: true, force: true });
});
