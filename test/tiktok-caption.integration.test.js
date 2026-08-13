import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

test("an unresolved TikTok mention remains plain caption text instead of raising IndexError", () => {
  const python = process.env.TIKTOK_TEST_PYTHON || (process.platform === "win32" ? "python" : "python3");
  const script = [
    "import json",
    "from scripts.tiktok_caption import convert_tags_resilient",
    "class Response:",
    "    text = 'login or blocked response without user data'",
    "class Session:",
    "    def request(self, *_args, **_kwargs): return Response()",
    "markup, extra = convert_tags_resilient('Hello @missing #topic', Session())",
    "print(json.dumps({'markup': markup, 'extra': extra}))"
  ].join("\n");

  const result = spawnSync(python, ["-c", script], {
    cwd: process.cwd(), encoding: "utf8", shell: false
  });
  assert.equal(result.status, 0, result.stderr);
  const converted = JSON.parse(result.stdout);
  assert.match(converted.markup, /Hello @missing/);
  assert.match(converted.markup, /<h id="1">#topic<\/h>/);
  assert.equal(converted.extra.some((item) => item.type === 0), false);
  assert.equal(converted.extra.some((item) => item.hashtag_name === "topic"), true);
});
