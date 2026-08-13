import test from "node:test";
import assert from "node:assert/strict";
import { ExtensionBridge, selectQueuedJob } from "../src/extension-bridge.js";

test("new jobs retain the Chrome profile selected for the bridge run", () => {
  const bridge = new ExtensionBridge({ chromeProfile: "work" });
  const job = bridge.enqueue({ platform: "youtube", videoPath: null, metadata: {}, mode: "publish" });
  assert.equal(job.chromeProfile, "work");
});

test("an extension claims only jobs assigned to its Chrome profile alias", () => {
  const jobs = [
    { id: "personal-job", status: "queued", chromeProfile: "personal" },
    { id: "work-job", status: "queued", chromeProfile: "work" }
  ];

  assert.equal(selectQueuedJob(jobs, "work")?.id, "work-job");
  assert.equal(selectQueuedJob(jobs, "personal")?.id, "personal-job");
  assert.equal(selectQueuedJob(jobs, "unconfigured"), undefined);
});

test("an unscoped job remains backwards compatible with any extension profile", () => {
  const jobs = [{ id: "unscoped", status: "queued", chromeProfile: null }];
  assert.equal(selectQueuedJob(jobs, "work")?.id, "unscoped");
  assert.equal(selectQueuedJob(jobs, null)?.id, "unscoped");
});

test("TikTok session setup jobs are scoped to the selected existing Chrome profile", () => {
  const bridge = new ExtensionBridge({ chromeProfile: "personal" });
  const job = bridge.enqueueTikTokSession({ accountHandle: "@creator" });

  assert.equal(job.platform, "tiktok-session");
  assert.equal(job.mode, "setup");
  assert.equal(job.chromeProfile, "personal");
  assert.deepEqual(job.metadata, { accountHandle: "@creator" });
  assert.equal(job.videoPath, null);
});

test("an older extension cannot claim a TikTok session-capture job", () => {
  const jobs = [{ id: "session-job", platform: "tiktok-session", status: "queued", chromeProfile: "personal" }];

  assert.equal(selectQueuedJob(jobs, "personal"), undefined);
  assert.equal(
    selectQueuedJob(jobs, "personal", { tiktokSession: true })?.id,
    "session-job"
  );
});
