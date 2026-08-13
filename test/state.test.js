import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { TransferState } from "../src/state.js";

test("only verified completion is skippable", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "reel-bridge-"));
  const args = ["ig-one", "https://www.instagram.com/reel/ABC/", "tiktok", "tt-one"];
  const state = new TransferState(cwd);
  assert.equal(state.isClaimed(...args), false);
  state.begin(...args);
  assert.equal(new TransferState(cwd).isClaimed(...args), false);
  assert.equal(new TransferState(cwd).has(...args), false);
  state.complete(...args);
  assert.equal(new TransferState(cwd).has(...args), true);
  assert.equal(new TransferState(cwd).isClaimed(...args), true);
  fs.rmSync(cwd, { recursive: true, force: true });
});
