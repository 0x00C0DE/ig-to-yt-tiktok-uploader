import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig, requireAccount } from "../src/config.js";

function config(accounts) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "reel-config-"));
  fs.writeFileSync(path.join(cwd, "config.json"), JSON.stringify({ accounts }));
  return { cwd, value: loadConfig(cwd) };
}

test("matching YouTube and TikTok handles remain independent account records", () => {
  const item = config({
    instagram: {},
    youtube: { "yt-main": { handle: "@ihooneez" } },
    tiktok: { "tt-main": { handle: "@ihooneez", sessionName: "tt-session" } }
  });
  try {
    assert.equal(requireAccount(item.value, "youtube", "yt-main").handle, "@ihooneez");
    assert.equal(requireAccount(item.value, "tiktok", "tt-main").handle, "@ihooneez");
    assert.equal(requireAccount(item.value, "tiktok", "tt-main").sessionName, "tt-session");
  } finally { fs.rmSync(item.cwd, { recursive: true, force: true }); }
});

test("different YouTube and TikTok handles resolve independently", () => {
  const item = config({
    instagram: {},
    youtube: { channel: { handle: "@youtube_account" } },
    tiktok: { profile: { handle: "@tiktok_account" } }
  });
  try {
    assert.equal(requireAccount(item.value, "youtube", "channel").handle, "@youtube_account");
    assert.equal(requireAccount(item.value, "tiktok", "profile").handle, "@tiktok_account");
  } finally { fs.rmSync(item.cwd, { recursive: true, force: true }); }
});

test("missing platform credentials report the available aliases without exposing secrets", () => {
  const item = config({ instagram: {}, youtube: {}, tiktok: {} });
  try {
    assert.throws(() => requireAccount(item.value, "youtube", "missing"), /Unknown youtube account.*none configured/);
    assert.throws(() => requireAccount(item.value, "tiktok", "missing"), /Unknown tiktok account.*none configured/);
  } finally { fs.rmSync(item.cwd, { recursive: true, force: true }); }
});
