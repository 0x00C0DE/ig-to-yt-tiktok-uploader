import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { captureWithFallback, findDownloadedReel, probeReel, ReelExtractionError } from "../src/downloader.js";

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

test("transient public extraction timeouts are retried before using authentication", async () => {
  const calls = [];
  const output = await captureWithFallback(
    { command: "yt-dlp", retries: 2, retryDelayMs: 0, cookieBrowser: "chrome:Profile 2" },
    ["--skip-download", "--dump-single-json", "https://www.instagram.com/reel/ABC/"],
    process.cwd(),
    async (command, args) => {
      calls.push({ command, args });
      if (calls.length === 1) throw new Error("curl: (28) Connection timed out after 20012 milliseconds");
      return '{"id":"ABC"}';
    }
  );

  assert.equal(output, '{"id":"ABC"}');
  assert.equal(calls.length, 2);
  assert.equal(calls.some((call) => call.args.includes("--cookies-from-browser")), false);
});

test("a locked Chrome cookie database does not prevent the configured fallback", async () => {
  const calls = [];
  const output = await captureWithFallback(
    {
      command: "yt-dlp", retries: 1, cookieBrowser: "chrome:Profile 2",
      fallbackCommand: "third-party-downloader", fallbackArgs: ["--provider", "fixture"]
    },
    ["--skip-download", "--dump-single-json", "https://www.instagram.com/reel/ABC/"],
    process.cwd(),
    async (command, args) => {
      calls.push({ command, args });
      if (command === "third-party-downloader") return '{"id":"ABC"}';
      if (args.includes("--cookies-from-browser")) throw new Error("Could not copy Chrome cookie database");
      throw new Error("public request timed out");
    }
  );

  assert.equal(output, '{"id":"ABC"}');
  assert.deepEqual(calls.map((call) => call.command), ["yt-dlp", "yt-dlp", "third-party-downloader"]);
});

test("a missing downloader executable remains a fatal configuration error", async () => {
  await assert.rejects(
    () => probeReel({ cwd: process.cwd(), reelUrl: "https://www.instagram.com/reel/ABC/", downloader: { command: "definitely-missing-downloader", retries: 1 } }),
    (error) => error instanceof ReelExtractionError && error.recoverable === false
  );
});
