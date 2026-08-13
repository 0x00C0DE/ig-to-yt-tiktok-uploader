import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

process.on("uncaughtException", (error) => {
  console.error(`TikTokAutoUploader installation failed: ${error.message}`);
  process.exitCode = 1;
});

const SOURCE = "https://github.com/makiisthenes/TiktokAutoUploader.git";
const REVISION = "d29b4366edf0de705e87f265298a06b64a00d7dc";
const cwd = process.cwd();
const target = path.join(cwd, ".vendor", "TiktokAutoUploader");
const python = process.env.TIKTOK_PYTHON || "python";
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: options.cwd || cwd, stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with code ${result.status}`);
}

function capture(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: options.cwd || cwd, encoding: "utf8", shell: false });
  if (result.error || result.status !== 0) return null;
  return String(result.stdout).trim();
}

const version = capture(python, ["-c", "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"]);
if (!version || Number(version.split(".")[0]) < 3 || (version.startsWith("3.") && Number(version.split(".")[1]) < 9)) {
  throw new Error(`TikTokAutoUploader requires Python 3.9 or newer; '${python}' reported ${version || "no usable version"}. Set TIKTOK_PYTHON to a newer Python executable.`);
}

if (!fs.existsSync(target)) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  run("git", ["clone", "--filter=blob:none", SOURCE, target]);
  run("git", ["-C", target, "fetch", "--depth", "1", "origin", REVISION]);
  run("git", ["-C", target, "checkout", "--detach", REVISION]);
} else {
  const current = capture("git", ["-C", target, "rev-parse", "HEAD"]);
  if (current !== REVISION) {
    throw new Error(`Existing TikTokAutoUploader checkout is ${current || "invalid"}; expected ${REVISION}. Move it aside or set each account's uploaderPath explicitly.`);
  }
}

const compatibilityPatch = path.join(cwd, "patches", "tiktok-auto-uploader-options.patch");
const patchApplied = spawnSync("git", ["-C", target, "apply", "--unidiff-zero", "--reverse", "--check", compatibilityPatch], { encoding: "utf8", shell: false }).status === 0;
if (!patchApplied) {
  run("git", ["-C", target, "apply", "--unidiff-zero", "--check", compatibilityPatch]);
  run("git", ["-C", target, "apply", "--unidiff-zero", compatibilityPatch]);
}

run(python, ["-m", "pip", "install", "-r", path.join(cwd, "requirements-tiktok-auto-uploader.txt")]);
const signature = path.join(target, "tiktok_uploader", "tiktok-signature");
run(npm, ["install"], { cwd: signature });
run(npx, ["playwright", "install", "chromium"], { cwd: signature });
console.log(`TikTokAutoUploader ${REVISION.slice(0, 12)} installed at ${target}`);
