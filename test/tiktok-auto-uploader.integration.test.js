import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { uploadTikTokAutoUploader } from "../src/uploaders/tiktok-auto-uploader.js";

test("Node adapter and Python bridge translate upstream success without network access", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "tiktok-process-smoke-"));
  const repo = path.join(cwd, "TiktokAutoUploader");
  const packageDirectory = path.join(repo, "tiktok_uploader");
  const cookieDirectory = path.join(repo, "CookiesDir");
  fs.mkdirSync(packageDirectory, { recursive: true });
  fs.mkdirSync(cookieDirectory, { recursive: true });
  fs.writeFileSync(path.join(repo, "cli.py"), "# smoke fixture\n");
  fs.writeFileSync(path.join(cookieDirectory, "tiktok_session-smoke.cookie"), "not-a-real-cookie");
  fs.writeFileSync(path.join(packageDirectory, "__init__.py"), "from . import tiktok\n");
  fs.writeFileSync(path.join(packageDirectory, "Config.py"), [
    "class Config:",
    "    @staticmethod",
    "    def load(_path):",
    "        return None",
    ""
  ].join("\n"));
  fs.writeFileSync(path.join(packageDirectory, "tiktok.py"), [
    "def upload_video(*_args, **_kwargs):",
    "    print('Published successfully')",
    "    return None",
    ""
  ].join("\n"));
  const videoPath = path.join(cwd, "smoke.mp4");
  fs.writeFileSync(videoPath, "fake-video-payload");

  try {
    const result = await uploadTikTokAutoUploader({
      cwd: process.cwd(),
      videoPath,
      metadata: { caption: "smoke caption" },
      mode: "publish",
      account: {
        handle: "@smoke",
        sessionName: "smoke",
        uploaderPath: repo,
        pythonCommand: process.env.TIKTOK_TEST_PYTHON || (process.platform === "win32" ? "python" : "python3")
      }
    });
    assert.equal(result.status, "completed");
    assert.equal(result.uploadMethod, "tiktok-auto-uploader");
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("Python bridge installs the fresh-session upload initializer retry", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "tiktok-upload-retry-smoke-"));
  const repo = path.join(cwd, "TiktokAutoUploader");
  const packageDirectory = path.join(repo, "tiktok_uploader");
  const cookieDirectory = path.join(repo, "CookiesDir");
  fs.mkdirSync(packageDirectory, { recursive: true });
  fs.mkdirSync(cookieDirectory, { recursive: true });
  fs.writeFileSync(path.join(repo, "cli.py"), "# smoke fixture\n");
  fs.writeFileSync(path.join(cookieDirectory, "tiktok_session-smoke.cookie"), "not-a-real-cookie");
  fs.writeFileSync(path.join(packageDirectory, "__init__.py"), "from . import tiktok\n");
  fs.writeFileSync(path.join(packageDirectory, "Config.py"), [
    "class Config:",
    "    @staticmethod",
    "    def load(_path):",
    "        return None",
    ""
  ].join("\n"));
  fs.writeFileSync(path.join(packageDirectory, "tiktok.py"), [
    "attempts = 0",
    "class Jar(dict):",
    "    def set(self, name, value, **_kwargs): self[name] = value",
    "class Session:",
    "    def __init__(self):",
    "        self.headers = {}",
    "        self.cookies = Jar()",
    "        self.proxies = {}",
    "        self.verify = True",
    "        self.auth = None",
    "def upload_to_tiktok(_video, session):",
    "    global attempts",
    "    attempts += 1",
    "    print(f'initializer attempt {attempts}')",
    "    if attempts == 1:",
    "        raise IndexError('list index out of range')",
    "    assert session.cookies.get('sessionid') == 'fixture-session'",
    "    return ('video-id', 'session-key', 'upload-id', [123], 'host', 'store-uri', 'auth', object())",
    "def upload_video(*args, **_kwargs):",
    "    session = Session()",
    "    session.cookies.set('sessionid', 'fixture-session', domain='.tiktok.com')",
    "    upload_to_tiktok(args[1], session)",
    "    print('Published successfully')",
    "    return None",
    ""
  ].join("\n"));
  const videoPath = path.join(cwd, "smoke.mp4");
  fs.writeFileSync(videoPath, "fake-video-payload");

  try {
    const result = await uploadTikTokAutoUploader({
      cwd: process.cwd(),
      videoPath,
      metadata: { caption: "smoke caption" },
      mode: "publish",
      account: {
        handle: "@smoke",
        sessionName: "smoke",
        uploaderPath: repo,
        pythonCommand: process.env.TIKTOK_TEST_PYTHON || (process.platform === "win32" ? "python" : "python3")
      }
    });
    assert.equal(result.status, "completed");
    assert.match(result.message, /publication confirmed/i);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
