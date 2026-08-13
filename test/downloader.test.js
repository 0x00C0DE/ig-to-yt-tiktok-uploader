import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { findDownloadedReel } from "../src/downloader.js";

test("selects the file matching the current Reel instead of the newest unrelated download", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "reel-download-"));
  const expected = path.join(directory, "CURRENT123.mp4");
  const unrelated = path.join(directory, "NEWER999.mp4");
  fs.writeFileSync(expected, "current");
  fs.writeFileSync(unrelated, "unrelated");
  const future = new Date(Date.now() + 10000);
  fs.utimesSync(unrelated, future, future);
  assert.equal(findDownloadedReel(directory, "https://www.instagram.com/reel/CURRENT123/"), expected);
  fs.rmSync(directory, { recursive: true, force: true });
});
