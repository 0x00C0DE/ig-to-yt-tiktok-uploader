import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

function resolveCommand(command) {
  if (process.platform !== "win32" || command.toLowerCase() !== "yt-dlp") return command;
  const packageRoot = path.join(process.env.LOCALAPPDATA || "", "Microsoft", "WinGet", "Packages");
  if (!fs.existsSync(packageRoot)) return command;
  const packageDirectory = fs.readdirSync(packageRoot).find((name) => name.startsWith("yt-dlp.yt-dlp_"));
  if (!packageDirectory) return command;
  const executable = path.join(packageRoot, packageDirectory, "yt-dlp.exe");
  return fs.existsSync(executable) ? executable : command;
}

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(resolveCommand(command), args, { cwd, stdio: "inherit", shell: false });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`)));
  });
}

function capture(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(resolveCommand(command), args, { cwd, shell: false, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => { stdout += data; });
    child.stderr.on("data", (data) => { stderr += data; });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve(stdout) : reject(new Error(stderr.trim() || `${command} exited with code ${code}`)));
  });
}

function attempts(downloader, args) {
  const command = downloader.command || "yt-dlp";
  const candidates = [{ command, args, label: "public" }];
  if (downloader.cookieBrowser) {
    candidates.push({
      command,
      args: ["--cookies-from-browser", downloader.cookieBrowser, ...args],
      label: `authenticated ${downloader.cookieBrowser.split(":")[0]} session`
    });
  }
  if (downloader.fallbackCommand) {
    candidates.push({
      command: downloader.fallbackCommand,
      args: [...(downloader.fallbackArgs || []), ...args],
      label: "configured third-party fallback"
    });
  }
  return candidates;
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function nonNegativeInteger(value, fallback, minimum = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= minimum ? parsed : fallback;
}

export class ReelExtractionError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "ReelExtractionError";
    this.recoverable = options.recoverable !== false;
  }
}

function isDownloaderConfigurationError(error) {
  return /(?:spawn|command|executable).*ENOENT|command not found|is not recognized as (?:the name of )?an? (?:internal or external )?command/i.test(
    String(error?.message || error)
  );
}

export function isTransientExtractionError(error) {
  return /curl:\s*\(28\)|connection timed out|timed out after|network is unreachable|connection reset|temporary failure|remote end closed connection/i.test(
    String(error?.message || error)
  );
}

async function tryCandidate({ candidate, operation, retries, retryDelayMs }) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await operation(candidate.command, candidate.args);
    } catch (error) {
      if (attempt >= retries || !isTransientExtractionError(error)) throw error;
      console.warn(`${candidate.label} extraction timed out (attempt ${attempt}/${retries}); retrying...`);
      if (retryDelayMs > 0) await wait(retryDelayMs);
    }
  }
}

export async function captureWithFallback(downloader, args, cwd, captureOperation = (command, commandArgs) => capture(command, commandArgs, cwd)) {
  const errors = [];
  for (const candidate of attempts(downloader, args)) {
    try {
      if (candidate.label !== "public") console.log(`Retrying Reel extraction with ${candidate.label}...`);
      return await tryCandidate({
        candidate,
        operation: captureOperation,
        retries: nonNegativeInteger(downloader.retries, 3, 1),
        retryDelayMs: nonNegativeInteger(downloader.retryDelayMs, 1000)
      });
    } catch (error) {
      errors.push(`${candidate.label}: ${error.message}`);
    }
  }
  throw new Error(errors.join(" | "));
}

async function runWithFallback(downloader, args, cwd) {
  const errors = [];
  for (const candidate of attempts(downloader, args)) {
    try {
      if (candidate.label !== "public") console.log(`Retrying Reel download with ${candidate.label}...`);
      await tryCandidate({
        candidate,
        operation: (command, commandArgs) => run(command, commandArgs, cwd),
        retries: nonNegativeInteger(downloader.retries, 3, 1),
        retryDelayMs: nonNegativeInteger(downloader.retryDelayMs, 1000)
      });
      return;
    } catch (error) {
      errors.push(`${candidate.label}: ${error.message}`);
    }
  }
  throw new Error(errors.join(" | "));
}

export function findDownloadedReel(directory, reelUrl) {
  const reelId = String(reelUrl).match(/\/reel\/([^/?#]+)/i)?.[1];
  const candidates = fs.readdirSync(directory)
    .filter((name) => /\.(mp4|mov|webm)$/i.test(name))
    .filter((name) => !reelId || path.parse(name).name === reelId)
    .map((name) => ({ filename: path.join(directory, name), time: fs.statSync(path.join(directory, name)).mtimeMs }))
    .sort((a, b) => b.time - a.time);
  if (!candidates[0]) throw new Error(`Downloader completed but no video file matching Reel ${reelId || "ID"} was found.`);
  return candidates[0].filename;
}

export async function probeReel({ cwd, reelUrl, downloader = {} }) {
  try {
    const output = await captureWithFallback(downloader, ["--skip-download", "--dump-single-json", reelUrl], cwd);
    const info = JSON.parse(output);
    return {
      caption: info.description || info.title || "",
      reelUrl,
      videoUrl: info.url || "",
      ogTitle: info.title || ""
    };
  } catch (error) {
    throw new ReelExtractionError(`Could not read Reel metadata: ${error.message}`, {
      cause: error,
      recoverable: !isDownloaderConfigurationError(error)
    });
  }
}

export async function downloadReel({ cwd, reelUrl, outputDirectory, downloader = {} }) {
  const directory = path.resolve(cwd, outputDirectory);
  fs.mkdirSync(directory, { recursive: true });
  const outputTemplate = path.join(directory, "%(id)s.%(ext)s");
  try {
    await runWithFallback(downloader, ["--no-playlist", "--format", "mp4/best", "--output", outputTemplate, reelUrl], cwd);
    return findDownloadedReel(directory, reelUrl);
  } catch (error) {
    throw new ReelExtractionError(`Could not download Reel media: ${error.message}`, {
      cause: error,
      recoverable: !isDownloaderConfigurationError(error)
    });
  }
}
