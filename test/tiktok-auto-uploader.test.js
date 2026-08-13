import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTikTokAutoUploaderInvocation,
  buildTikTokAutoUploaderLoginInvocation,
  buildTikTokSessionSaveInvocation,
  saveTikTokAutoUploaderSession,
  uploadTikTokAutoUploader
} from "../src/uploaders/tiktok-auto-uploader.js";

function fixture() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "tiktok-auto-adapter-"));
  const repo = path.join(cwd, ".vendor", "TiktokAutoUploader");
  const cookies = path.join(repo, "CookiesDir");
  fs.mkdirSync(cookies, { recursive: true });
  fs.writeFileSync(path.join(repo, "cli.py"), "# fixture");
  fs.writeFileSync(path.join(cookies, "tiktok_session-creator-session.cookie"), "fixture-secret");
  const videoPath = path.join(cwd, "ABC.mp4");
  fs.writeFileSync(videoPath, "video");
  return { cwd, repo, videoPath };
}

test("maps account handle, local session, caption, and upload settings to the upstream bridge", () => {
  const item = fixture();
  try {
    const invocation = buildTikTokAutoUploaderInvocation({
      ...item,
      metadata: { caption: "caption #one" },
      mode: "publish",
      account: {
        handle: "@creator_handle", sessionName: "creator-session", uploaderPath: item.repo,
        visibility: 1, allowComment: false, allowDuet: true, allowStitch: true
      }
    });
    assert.equal(invocation.accountHandle, "@creator_handle");
    assert.ok(invocation.args.includes("creator-session"));
    assert.ok(invocation.args.includes("caption #one"));
    assert.ok(invocation.args.includes("1"));
  } finally { fs.rmSync(item.cwd, { recursive: true, force: true }); }
});

test("a successful mocked upstream process returns a completed structured result", async () => {
  const item = fixture();
  try {
    const calls = [];
    const result = await uploadTikTokAutoUploader({
      ...item, metadata: { caption: "hello" }, mode: "publish",
      account: { handle: "@creator_handle", sessionName: "creator-session", uploaderPath: item.repo },
      runProcess: async (invocation) => { calls.push(invocation); return { code: 0, stdout: "Published successfully", stderr: "" }; }
    });
    assert.equal(calls.length, 1);
    assert.equal(result.status, "completed");
    assert.match(result.message, /@creator_handle/);
  } finally { fs.rmSync(item.cwd, { recursive: true, force: true }); }
});

test("missing TikTok session credentials fail before any network process starts", async () => {
  const item = fixture();
  fs.rmSync(path.join(item.repo, "CookiesDir"), { recursive: true, force: true });
  let invoked = false;
  try {
    await assert.rejects(() => uploadTikTokAutoUploader({
      ...item, metadata: { caption: "hello" }, mode: "publish",
      account: { handle: "@creator_handle", sessionName: "missing", uploaderPath: item.repo },
      runProcess: async () => { invoked = true; }
    }), /session.*missing|cookie/i);
    assert.equal(invoked, false);
  } finally { fs.rmSync(item.cwd, { recursive: true, force: true }); }
});

test("missing upstream installation and malformed media fail clearly", async () => {
  const item = fixture();
  try {
    assert.throws(() => buildTikTokAutoUploaderInvocation({
      ...item, metadata: { caption: "hello" }, mode: "publish",
      account: { handle: "@creator_handle", sessionName: "creator-session", uploaderPath: path.join(item.cwd, "missing") }
    }), /not installed/i);
    const bad = path.join(item.cwd, "bad.txt");
    fs.writeFileSync(bad, "bad");
    assert.throws(() => buildTikTokAutoUploaderInvocation({
      cwd: item.cwd, repo: item.repo, videoPath: bad, metadata: { caption: "hello" }, mode: "publish",
      account: { handle: "@creator_handle", sessionName: "creator-session", uploaderPath: item.repo }
    }), /unsupported TikTok video/i);
  } finally { fs.rmSync(item.cwd, { recursive: true, force: true }); }
});

test("upstream authentication errors are returned without leaking cookie contents", async () => {
  const item = fixture();
  try {
    await assert.rejects(() => uploadTikTokAutoUploader({
      ...item, metadata: { caption: "hello" }, mode: "publish",
      account: { handle: "@creator_handle", sessionName: "creator-session", uploaderPath: item.repo },
      runProcess: async () => ({ code: 2, stdout: "", stderr: "TikTok session expired" })
    }), (error) => /session expired/.test(error.message) && !/fixture-secret/.test(error.message));
  } finally { fs.rmSync(item.cwd, { recursive: true, force: true }); }
});

test("login uses the configured TikTok session alias independently of the public handle", () => {
  const item = fixture();
  try {
    const invocation = buildTikTokAutoUploaderLoginInvocation({
      cwd: item.cwd,
      account: {
        handle: "@public_tiktok_name",
        sessionName: "local-session-one",
        uploaderPath: item.repo,
        pythonCommand: "py"
      }
    });
    assert.equal(invocation.command, "py");
    assert.deepEqual(invocation.args.slice(-3), ["login", "--name", "local-session-one"]);
    assert.equal(invocation.accountHandle, "@public_tiktok_name");
  } finally { fs.rmSync(item.cwd, { recursive: true, force: true }); }
});

test("existing Chrome cookies are saved through stdin without exposing them in command arguments", async () => {
  const item = fixture();
  const cookies = [
    { name: "sessionid", value: "session-secret", domain: ".tiktok.com", path: "/" },
    { name: "tt-target-idc", value: "useast2a", domain: ".tiktok.com", path: "/" }
  ];
  try {
    const account = {
      handle: "@creator_handle",
      sessionName: "profile-session",
      uploaderPath: item.repo,
      pythonCommand: "python"
    };
    const invocation = buildTikTokSessionSaveInvocation({ cwd: item.cwd, account, cookies });
    assert.equal(invocation.args.some((value) => String(value).includes("session-secret")), false);
    assert.match(invocation.stdin, /session-secret/);
    assert.match(invocation.outputPath, /tiktok_session-profile-session\.cookie$/);

    let received;
    const result = await saveTikTokAutoUploaderSession({
      cwd: item.cwd,
      account,
      cookies,
      runProcess: async (value) => {
        received = value;
        return { code: 0, stdout: '{"ok": true}', stderr: "" };
      }
    });
    assert.equal(received.stdin, invocation.stdin);
    assert.equal(result.status, "completed");
    assert.equal(result.message.includes("session-secret"), false);
  } finally { fs.rmSync(item.cwd, { recursive: true, force: true }); }
});

test("session persistence rejects incomplete cookies and unsafe session names", () => {
  const item = fixture();
  try {
    assert.throws(() => buildTikTokSessionSaveInvocation({
      cwd: item.cwd,
      account: { sessionName: "missing-dc", uploaderPath: item.repo },
      cookies: [{ name: "sessionid", value: "secret" }]
    }), /tt-target-idc/);
    assert.throws(() => buildTikTokSessionSaveInvocation({
      cwd: item.cwd,
      account: { sessionName: "..\\escape", uploaderPath: item.repo },
      cookies: [
        { name: "sessionid", value: "secret" },
        { name: "tt-target-idc", value: "useast2a" }
      ]
    }), /session name/i);
  } finally { fs.rmSync(item.cwd, { recursive: true, force: true }); }
});
