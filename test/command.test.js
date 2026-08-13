import test from "node:test";
import assert from "node:assert/strict";
import { resolveNodePackageManagerCommand } from "../src/command.js";

test("Windows npm tools run their JavaScript entry points without a command shell", () => {
  assert.deepEqual(
    resolveNodePackageManagerCommand("npm", {
      platform: "win32",
      execPath: "C:\\Program Files\\nodejs\\node.exe"
    }),
    {
      command: "C:\\Program Files\\nodejs\\node.exe",
      args: ["C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js"]
    }
  );
  assert.deepEqual(
    resolveNodePackageManagerCommand("npx", {
      platform: "win32",
      execPath: "C:\\Program Files\\nodejs\\node.exe"
    }).args,
    ["C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npx-cli.js"]
  );
});

test("non-Windows npm tools run directly", () => {
  assert.deepEqual(
    resolveNodePackageManagerCommand("npm", { platform: "linux", execPath: "/usr/bin/node" }),
    { command: "npm", args: [] }
  );
});
