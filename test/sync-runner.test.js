import test from "node:test";
import assert from "node:assert/strict";
import { processReelSequence } from "../src/sync-runner.js";

test("a destination failure is counted and the next Reel is still processed", async () => {
  const attempted = [];
  const warnings = [];
  const summary = await processReelSequence({
    reels: ["reel-one", "reel-two", "reel-three"],
    processReel: async (reel) => {
      attempted.push(reel);
      if (reel === "reel-one") {
        return {
          skipped: false,
          failures: [{ platform: "tiktok", accountId: "tt-main", message: "upstream failed" }]
        };
      }
      if (reel === "reel-two") return { skipped: true, failures: [] };
      return { skipped: false, failures: [] };
    },
    isUnavailable: () => false,
    logger: { log() {}, warn(message) { warnings.push(message); } }
  });

  assert.deepEqual(attempted, ["reel-one", "reel-two", "reel-three"]);
  assert.deepEqual(summary, { completed: 1, skipped: 1, failed: 1, inaccessible: 0 });
  assert.match(warnings[0], /tiktok\/tt-main.*continuing/i);
});

test("unexpected non-destination errors remain fatal", async () => {
  await assert.rejects(() => processReelSequence({
    reels: ["reel-one", "reel-two"],
    processReel: async () => { throw new Error("configuration is invalid"); },
    isUnavailable: () => false,
    logger: { log() {}, warn() {} }
  }), /configuration is invalid/);
});

test("inaccessible Reels retain their existing skip-and-continue behavior", async () => {
  const unavailable = [];
  const summary = await processReelSequence({
    reels: ["blocked", "accessible"],
    processReel: async (reel) => {
      if (reel === "blocked") throw new Error("content isn't available");
      return { skipped: false, failures: [] };
    },
    isUnavailable: (error) => /isn't available/.test(error.message),
    markUnavailable: async (reel) => unavailable.push(reel),
    logger: { log() {}, warn() {} }
  });

  assert.deepEqual(unavailable, ["blocked"]);
  assert.deepEqual(summary, { completed: 1, skipped: 0, failed: 0, inaccessible: 1 });
});
