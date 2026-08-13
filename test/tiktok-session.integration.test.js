import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";
import { saveTikTokAutoUploaderSession } from "../src/uploaders/tiktok-auto-uploader.js";

test("persists existing-Chrome TikTok cookies in the upstream pickle format", async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "tiktok-session-import-"));
  const uploaderPath = path.join(temporary, "TiktokAutoUploader");
  fs.mkdirSync(uploaderPath, { recursive: true });
  fs.writeFileSync(path.join(uploaderPath, "cli.py"), "# fixture\n");
  const python = process.env.TIKTOK_TEST_PYTHON || (process.platform === "win32" ? "python" : "python3");
  try {
    const result = await saveTikTokAutoUploaderSession({
      cwd: process.cwd(),
      account: {
        handle: "@fixture",
        sessionName: "existing-chrome",
        uploaderPath,
        pythonCommand: python
      },
      cookies: [
        { name: "sessionid", value: "fixture-session", domain: ".tiktok.com", path: "/" },
        { name: "tt-target-idc", value: "useast2a", domain: ".tiktok.com", path: "/" }
      ]
    });
    assert.equal(result.status, "completed");

    const cookiePath = path.join(uploaderPath, "CookiesDir", "tiktok_session-existing-chrome.cookie");
    const inspection = spawnSync(python, [
      "-c",
      "import json,pickle,sys; print(json.dumps([c['name'] for c in pickle.load(open(sys.argv[1], 'rb'))]))",
      cookiePath
    ], { encoding: "utf8", shell: false });
    assert.equal(inspection.status, 0, inspection.stderr);
    assert.deepEqual(JSON.parse(inspection.stdout), ["sessionid", "tt-target-idc"]);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
