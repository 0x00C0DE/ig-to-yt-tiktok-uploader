import test from "node:test";
import assert from "node:assert/strict";
import { selectTikTokSessionCookies } from "../extension/tiktok-session.js";

test("selects only the two TikTok cookies required by the HTTP uploader", () => {
  const result = selectTikTokSessionCookies([
    { name: "other", value: "do-not-copy", domain: ".tiktok.com" },
    { name: "tt-target-idc", value: "useast2a", domain: ".tiktok.com", path: "/", secure: true },
    { name: "sessionid", value: "session-secret", domain: ".tiktok.com", path: "/", httpOnly: true, secure: true }
  ]);

  assert.equal(result.ready, true);
  assert.deepEqual(result.cookies.map((cookie) => cookie.name), ["sessionid", "tt-target-idc"]);
  assert.equal(result.cookies.some((cookie) => cookie.value === "do-not-copy"), false);
});

test("does not return a partial TikTok session", () => {
  const result = selectTikTokSessionCookies([
    { name: "sessionid", value: "session-secret", domain: ".tiktok.com" }
  ]);

  assert.equal(result.ready, false);
  assert.deepEqual(result.missing, ["tt-target-idc"]);
  assert.equal(result.cookies, undefined);
});
