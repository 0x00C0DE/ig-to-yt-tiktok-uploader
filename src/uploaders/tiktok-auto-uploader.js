import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const SUPPORTED_VIDEO = new Set([".mp4", ".mov", ".webm"]);

function asSwitch(value, defaultValue) {
  return String(Number(value === undefined ? defaultValue : Boolean(value)));
}

function normalizeHandle(value) {
  if (!value) return null;
  return String(value).startsWith("@") ? String(value) : `@${value}`;
}

function resolveFrom(base, value) {
  return path.isAbsolute(value) ? value : path.resolve(base, value);
}

export function buildTikTokAutoUploaderInvocation({ cwd, videoPath, metadata, account, mode }) {
  if (mode !== "publish") throw new Error("TikTokAutoUploader supports immediate publish mode only");
  const resolvedVideo = path.resolve(videoPath);
  if (!fs.existsSync(resolvedVideo) || !fs.statSync(resolvedVideo).isFile()) {
    throw new Error(`TikTok video does not exist: ${resolvedVideo}`);
  }
  if (!SUPPORTED_VIDEO.has(path.extname(resolvedVideo).toLowerCase())) {
    throw new Error(`Unsupported TikTok video type '${path.extname(resolvedVideo) || "none"}'. Use MP4, MOV, or WEBM.`);
  }

  const uploaderRoot = resolveFrom(cwd, account.uploaderPath || ".vendor/TiktokAutoUploader");
  if (!fs.existsSync(path.join(uploaderRoot, "cli.py"))) {
    throw new Error(`TikTokAutoUploader is not installed at ${uploaderRoot}`);
  }
  const accountHandle = normalizeHandle(account.handle || account.label || account.id);
  const sessionName = account.sessionName || accountHandle?.replace(/^@/, "");
  if (!sessionName) throw new Error("TikTok session name is missing from the account configuration");
  const cookieDirectory = resolveFrom(uploaderRoot, account.cookiesDirectory || "CookiesDir");
  const cookieFile = path.join(cookieDirectory, `tiktok_session-${sessionName}.cookie`);
  if (!fs.existsSync(cookieFile)) {
    throw new Error(`TikTok session cookie is missing for ${accountHandle || sessionName}. Run the TikTok setup/login command first.`);
  }

  const caption = String(metadata?.caption || "");
  if (!caption) throw new Error("TikTok caption is missing");
  if ([...caption].length > 2200) throw new Error("TikTok caption exceeds TikTokAutoUploader's 2200-character limit");
  const bridgeScript = path.join(cwd, "scripts", "tiktok_auto_uploader_bridge.py");
  return {
    command: process.env.TIKTOK_PYTHON || account.pythonCommand || "python",
    cwd: uploaderRoot,
    timeoutMs: Number(account.timeoutMs) > 0 ? Number(account.timeoutMs) : 10 * 60_000,
    accountHandle: accountHandle || `@${sessionName}`,
    args: [
      bridgeScript,
      "--repo", uploaderRoot,
      "--session", sessionName,
      "--video", resolvedVideo,
      "--caption", caption,
      "--visibility", String(Number(account.visibility ?? 0)),
      "--allow-comment", asSwitch(account.allowComment, true),
      "--allow-duet", asSwitch(account.allowDuet, false),
      "--allow-stitch", asSwitch(account.allowStitch, false),
      "--brand-organic", "0",
      "--branded-content", "0",
      "--ai-label", "0",
      ...(account.proxyEnv ? ["--proxy-env", account.proxyEnv] : [])
    ]
  };
}

export function buildTikTokAutoUploaderLoginInvocation({ cwd, account }) {
  const uploaderRoot = resolveFrom(cwd, account.uploaderPath || ".vendor/TiktokAutoUploader");
  const entrypoint = path.join(uploaderRoot, "cli.py");
  if (!fs.existsSync(entrypoint)) throw new Error(`TikTokAutoUploader is not installed at ${uploaderRoot}`);
  const accountHandle = normalizeHandle(account.handle || account.label || account.id);
  const sessionName = account.sessionName || accountHandle?.replace(/^@/, "");
  if (!sessionName) throw new Error("TikTok session name is missing from the account configuration");
  return {
    command: process.env.TIKTOK_PYTHON || account.pythonCommand || "python",
    cwd: uploaderRoot,
    timeoutMs: Number(account.loginTimeoutMs) > 0 ? Number(account.loginTimeoutMs) : 20 * 60_000,
    accountHandle: accountHandle || `@${sessionName}`,
    args: [entrypoint, "login", "--name", sessionName]
  };
}

export function runTikTokAutoUploaderProcess(invocation) {
  return new Promise((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      cwd: invocation.cwd,
      windowsHide: true,
      shell: false,
      env: process.env
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`TikTokAutoUploader timed out after ${Math.round(invocation.timeoutMs / 60000)} minutes`));
    }, invocation.timeoutMs);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
  });
}

export async function uploadTikTokAutoUploader(input) {
  const invocation = buildTikTokAutoUploaderInvocation(input);
  const runProcess = input.runProcess || runTikTokAutoUploaderProcess;
  const outcome = await runProcess(invocation);
  if (outcome.code !== 0) {
    const detail = String(outcome.stderr || outcome.stdout || `process exited with code ${outcome.code}`).trim();
    throw new Error(`TikTokAutoUploader failed for ${invocation.accountHandle}: ${detail.slice(-2000)}`);
  }
  return {
    status: "completed",
    message: `TikTokAutoUploader publication confirmed for ${invocation.accountHandle}`,
    uploadMethod: "tiktok-auto-uploader"
  };
}

export async function loginTikTokAutoUploader(input) {
  const invocation = buildTikTokAutoUploaderLoginInvocation(input);
  const runProcess = input.runProcess || runTikTokAutoUploaderProcess;
  const outcome = await runProcess(invocation);
  if (outcome.code !== 0) {
    const detail = String(outcome.stderr || outcome.stdout || `process exited with code ${outcome.code}`).trim();
    throw new Error(`TikTokAutoUploader login failed for ${invocation.accountHandle}: ${detail.slice(-2000)}`);
  }
  return { status: "completed", message: `TikTok session saved for ${invocation.accountHandle}` };
}
