import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

test("example configuration defaults to publish when TikTokAutoUploader is enabled", () => {
  const example = JSON.parse(fs.readFileSync(new URL("../config.example.json", import.meta.url), "utf8"));
  const usesImmediateUploader = Object.values(example.accounts.tiktok || {})
    .some((account) => account.uploadMethod === "tiktok-auto-uploader");
  assert.equal(usesImmediateUploader, true);
  assert.equal(example.defaults.mode, "publish");
});
