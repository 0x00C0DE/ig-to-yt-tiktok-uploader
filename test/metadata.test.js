import test from "node:test";
import assert from "node:assert/strict";
import { mapMetadata } from "../src/metadata.js";
import { canonicalReelUrl } from "../src/instagram.js";

test("preserves caption, line breaks, tags, mentions, and emoji", () => {
  const caption = "A day outside 🌲\n\n@friend #Nature #PNW #Nature";
  const mapped = mapMetadata({ caption, reelUrl: "https://www.instagram.com/reel/abc/" });
  assert.equal(mapped.tiktok.caption, caption);
  assert.equal(mapped.youtube.description, caption);
  assert.equal(mapped.youtube.title, "A day outside 🌲 @friend #Nature #PNW #Nature");
  assert.deepEqual(mapped.youtube.tags, ["Nature", "PNW"]);
});

test("canonicalizes Reel URLs for stable duplicate keys", () => {
  assert.equal(canonicalReelUrl("https://instagram.com/reel/ABC123?igsh=xyz"), "https://www.instagram.com/reel/ABC123/");
  assert.equal(canonicalReelUrl("https://www.instagram.com/reel/ABC123/"), "https://www.instagram.com/reel/ABC123/");
  assert.equal(canonicalReelUrl("https://www.instagram.com/creator_handle/reel/ABC123/"), "https://www.instagram.com/reel/ABC123/");
  assert.equal(canonicalReelUrl("https://example.com/video"), null);
});

test("truncates YouTube title by Unicode characters", () => {
  const caption = "😀".repeat(120);
  const { youtube } = mapMetadata({ caption, reelUrl: "x" });
  assert.equal([...youtube.title].length, 100);
  assert.ok(youtube.title.endsWith("…"));
});

test("uses the complete Instagram caption as a single-line YouTube title when it fits", () => {
  const caption = "First line\nSecond line #tag";
  assert.equal(mapMetadata({ caption, reelUrl: "x" }).youtube.title, "First line Second line #tag");
});
