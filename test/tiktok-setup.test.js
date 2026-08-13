import test from "node:test";
import assert from "node:assert/strict";
import { setupTikTokAutoUploaderInChrome } from "../src/tiktok-setup.js";

test("TikTok setup imports the session from the addressed existing Chrome profile", async () => {
  const cookies = [
    { name: "sessionid", value: "secret" },
    { name: "tt-target-idc", value: "useast2a" }
  ];
  const job = { result: { cookies } };
  const events = [];
  const bridge = {
    async start() { events.push("start"); },
    enqueueTikTokSession(input) { events.push(["enqueue", input]); return job; },
    async wait(value, timeout) { events.push(["wait", value, timeout]); return job; },
    async stop() { events.push("stop"); }
  };
  const result = await setupTikTokAutoUploaderInChrome({
    cwd: "C:/project",
    account: { handle: "@creator", loginTimeoutMs: 1234 },
    chromeProfile: { id: "profile-3", profileDirectory: "Profile 3" },
    createBridge: (options) => { events.push(["bridge", options]); return bridge; },
    saveSession: async (input) => {
      events.push(["save", input.cookies]);
      return { status: "completed", message: "saved" };
    }
  });

  assert.deepEqual(events[0], ["bridge", { chromeProfile: "profile-3" }]);
  assert.deepEqual(events[2], ["enqueue", { accountHandle: "@creator" }]);
  assert.deepEqual(events[3], ["wait", job, 1234]);
  assert.deepEqual(events[4], ["save", cookies]);
  assert.equal(events.at(-1), "stop");
  assert.equal(job.result, null);
  assert.equal(result.status, "completed");
});

test("TikTok existing-Chrome setup requires a logical profile alias", async () => {
  await assert.rejects(
    () => setupTikTokAutoUploaderInChrome({
      cwd: "C:/project",
      account: {},
      chromeProfile: { id: null, profileDirectory: "Profile 3" }
    }),
    /logical Chrome profile alias/i
  );
});
