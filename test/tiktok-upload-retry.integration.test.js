import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

const python = process.env.TIKTOK_TEST_PYTHON || (process.platform === "win32" ? "python" : "python3");

function runPython(lines) {
  return spawnSync(python, ["-c", lines.join("\n")], {
    cwd: process.cwd(), encoding: "utf8", shell: false
  });
}

test("an empty TikTok upload-node response retries with a fresh authenticated session", () => {
  const result = runPython([
    "import json",
    "from scripts.tiktok_upload_retry import build_upload_initializer_with_retry",
    "class Jar(dict):",
    "    def update(self, other): super().update(other)",
    "class Session:",
    "    def __init__(self, label):",
    "        self.label = label",
    "        self.headers = {'User-Agent': 'fixture'}",
    "        self.cookies = Jar({'sessionid': 'secret', 'tt-target-idc': 'useast5'})",
    "        self.proxies = {'https': 'proxy'}",
    "        self.verify = True",
    "initial = Session('initial')",
    "created = []",
    "def session_factory(source):",
    "    fresh = Session('fresh')",
    "    fresh.headers.update(source.headers)",
    "    fresh.cookies.update(source.cookies)",
    "    fresh.proxies.update(source.proxies)",
    "    created.append(fresh)",
    "    return fresh",
    "calls = []",
    "def upstream(_video, session):",
    "    calls.append(session.label)",
    "    if len(calls) == 1: raise IndexError('list index out of range')",
    "    return ('video-id', 'session-key', 'upload-id', [123], 'host', 'store-uri', 'auth', object())",
    "wrapped = build_upload_initializer_with_retry(upstream, attempts=3, delay_seconds=0, session_factory=session_factory)",
    "upload = wrapped('video.mp4', initial)",
    "print(json.dumps({'calls': calls, 'created': len(created), 'video_id': upload[0], 'cookies': dict(initial.cookies)}))"
  ]);

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  assert.deepEqual(output.calls, ["initial", "fresh"]);
  assert.equal(output.created, 1);
  assert.equal(output.video_id, "video-id");
  assert.equal(output.cookies.sessionid, "secret");
});

test("repeated empty upload-node responses fail with a useful error instead of IndexError", () => {
  const result = runPython([
    "from scripts.tiktok_upload_retry import TikTokUploadInitializationError, build_upload_initializer_with_retry",
    "class Session:",
    "    headers = {}",
    "    cookies = {}",
    "    proxies = {}",
    "    verify = True",
    "def upstream(_video, _session): raise IndexError('list index out of range')",
    "wrapped = build_upload_initializer_with_retry(upstream, attempts=3, delay_seconds=0, session_factory=lambda _source: Session())",
    "try:",
    "    wrapped('video.mp4', Session())",
    "except TikTokUploadInitializationError as error:",
    "    print(str(error))",
    "else:",
    "    raise AssertionError('expected initialization failure')"
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /no usable upload endpoint after 3 attempts/i);
  assert.doesNotMatch(result.stdout, /list index out of range/i);
});
