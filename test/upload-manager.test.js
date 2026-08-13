import test from "node:test";
import assert from "node:assert/strict";
import { UploadManager } from "../src/upload-manager.js";

class FakeState {
  constructor(completed = []) {
    this.completed = new Set(completed);
    this.events = [];
  }
  key(source, reel, platform, account) { return [source, reel, platform, account].join("|"); }
  has(...args) { return this.completed.has(this.key(...args)); }
  begin(...args) { this.events.push(["begin", ...args]); }
  complete(...args) { this.completed.add(this.key(...args)); this.events.push(["complete", ...args]); }
  needsReview(...args) { this.events.push(["needs_review", ...args.slice(0, 4)]); }
}

const base = {
  sourceAccount: "ig-source",
  reelUrl: "https://www.instagram.com/reel/ABC/",
  videoPath: "C:/videos/ABC.mp4",
  metadata: {
    youtube: { title: "YouTube title", description: "YouTube description" },
    tiktok: { caption: "TikTok caption #tag" }
  },
  mode: "publish"
};

function account(platform, id) {
  return { id, handle: platform === "youtube" ? "@youtube_account" : "@tiktok_account" };
}

test("YouTube-only dispatch preserves the existing YouTube path", async () => {
  const calls = [];
  const manager = new UploadManager({
    state: new FakeState(),
    resolveAccount: account,
    uploaders: {
      youtube: async (context) => { calls.push(context); return { status: "completed", message: "ok" }; }
    }
  });
  const results = await manager.upload({ ...base, destinations: [["youtube", "yt-main"]] });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].metadata, base.metadata.youtube);
  assert.equal(results.youtube.status, "completed");
});
test("TikTok-only dispatch resolves its independent account and caption", async () => {
  const calls = [];
  const manager = new UploadManager({
    state: new FakeState(), resolveAccount: account,
    uploaders: { tiktok: async (context) => { calls.push(context); return { status: "completed" }; } }
  });
  const results = await manager.upload({ ...base, destinations: [["tiktok", "tt-main"]] });
  assert.equal(calls[0].account.handle, "@tiktok_account");
  assert.deepEqual(calls[0].metadata, base.metadata.tiktok);
  assert.equal(results.tiktok.accountId, "tt-main");
});

test("YouTube and TikTok start concurrently and retain independent matching handles", async () => {
  const started = [];
  const releases = {};
  const uploader = (platform) => async (context) => {
    started.push([platform, context.account.handle]);
    await new Promise((resolve) => { releases[platform] = resolve; });
    return { status: "completed", message: `${platform} done` };
  };
  const manager = new UploadManager({
    state: new FakeState(),
    resolveAccount: (platform, id) => ({ id, handle: "@shared_account" }),
    uploaders: { youtube: uploader("youtube"), tiktok: uploader("tiktok") }
  });
  const pending = manager.upload({ ...base, destinations: [["youtube", "yt-main"], ["tiktok", "tt-main"]] });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(started, [["youtube", "@shared_account"], ["tiktok", "@shared_account"]]);
  releases.youtube();
  releases.tiktok();
  const results = await pending;
  assert.equal(results.youtube.status, "completed");
  assert.equal(results.tiktok.status, "completed");
});

test("one platform failure does not cancel or corrupt the other result", async () => {
  const state = new FakeState();
  const manager = new UploadManager({
    state, resolveAccount: account,
    uploaders: {
      youtube: async () => ({ status: "completed", message: "published" }),
      tiktok: async () => { throw new Error("TikTok session expired"); }
    }
  });
  const results = await manager.upload({ ...base, destinations: [["youtube", "yt-main"], ["tiktok", "tt-main"]] });
  assert.equal(results.youtube.status, "completed");
  assert.equal(results.tiktok.status, "failed");
  assert.match(results.tiktok.message, /session expired/);
  assert.equal(state.events.filter(([event]) => event === "complete").length, 1);
  assert.equal(state.events.filter(([event]) => event === "needs_review").length, 1);
});

test("completed source/destination pairs are skipped without duplicate dispatch", async () => {
  const key = "ig-source|https://www.instagram.com/reel/ABC/|youtube|yt-main";
  const state = new FakeState([key]);
  let calls = 0;
  const manager = new UploadManager({
    state, resolveAccount: account,
    uploaders: { youtube: async () => { calls++; return { status: "completed" }; } }
  });
  const results = await manager.upload({ ...base, destinations: [["youtube", "yt-main"]] });
  assert.equal(calls, 0);
  assert.equal(results.youtube.status, "skipped");
});
