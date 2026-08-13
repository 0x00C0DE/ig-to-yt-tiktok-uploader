import test from "node:test";
import assert from "node:assert/strict";
import { selectDestinations, selectedPlatforms } from "../src/destinations.js";

test("can select only YouTube while both account aliases are supplied", () => {
  assert.deepEqual(
    selectDestinations({ platforms: "youtube", tiktok: "tt-main", youtube: "yt-main" }),
    [["youtube", "yt-main"]]
  );
});

test("can select only TikTok while both account aliases are supplied", () => {
  assert.deepEqual(
    selectDestinations({ platforms: "tiktok", tiktok: "tt-main", youtube: "yt-main" }),
    [["tiktok", "tt-main"]]
  );
});

test("rejects unsupported platform selections", () => {
  assert.throws(() => selectedPlatforms("instagram"), /Unsupported platform/);
});
