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

test("example TikTokAutoUploader accounts import login from the selected Chrome extension", () => {
  const example = JSON.parse(fs.readFileSync(new URL("../config.example.json", import.meta.url), "utf8"));
  const account = Object.values(example.accounts.tiktok || {})
    .find((value) => value.uploadMethod === "tiktok-auto-uploader");
  assert.equal(account?.loginMethod, "extension");
  assert.ok(example.defaults.chromeProfile);
});

test("tracked examples use generic handles and expose selectable Chrome profiles", () => {
  const readme = fs.readFileSync(new URL("../README.md", import.meta.url), "utf8");
  const exampleText = fs.readFileSync(new URL("../config.example.json", import.meta.url), "utf8");
  const example = JSON.parse(exampleText);

  assert.match(readme, /@source_handle/);
  assert.match(exampleText, /@youtube_handle/);
  assert.match(exampleText, /@tiktok_handle/);
  assert.ok(Object.keys(example.chromeProfiles || {}).length >= 2);
  assert.ok(example.defaults.chromeProfile);
  assert.equal(example.defaults.chromeProfileDirectory, undefined);
});

test("tracked examples contain no machine-specific user paths", () => {
  const trackedExamples = [
    fs.readFileSync(new URL("../README.md", import.meta.url), "utf8"),
    fs.readFileSync(new URL("../config.example.json", import.meta.url), "utf8"),
    fs.readFileSync(new URL("../.env.example", import.meta.url), "utf8")
  ].join("\n");

  assert.doesNotMatch(trackedExamples, /[A-Za-z]:\\Users\\[^\\\s]+/i);
  assert.doesNotMatch(trackedExamples, /\/Users\/[^/\s]+/);
  assert.doesNotMatch(trackedExamples, /\/home\/[^/\s]+/);
});
