import test from "node:test";
import assert from "node:assert/strict";
import { chunkPlan } from "../src/uploaders/tiktok-api.js";

test("uploads ordinary Reel-sized videos as one TikTok API chunk", () => {
  const size = 15 * 1024 * 1024;
  assert.deepEqual(chunkPlan(size), { chunkSize: size, totalChunkCount: 1 });
});

test("uses TikTok-compatible chunks for larger videos", () => {
  assert.deepEqual(chunkPlan(55 * 1024 * 1024), {
    chunkSize: 10 * 1024 * 1024,
    totalChunkCount: 5
  });
});

test("rejects an empty TikTok video", () => {
  assert.throws(() => chunkPlan(0), /empty video/);
});
