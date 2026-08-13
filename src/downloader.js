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

async function captureWithFallback(downloader, args, cwd) {
  const errors = [];
  for (const candidate of attempts(downloader, args)) {
    try {
      if (candidate.label !== "public") console.log(`Retrying Reel extraction with ${candidate.label}...`);
      return await capture(candidate.command, candidate.args, cwd);
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
      await run(candidate.command, candidate.args, cwd);
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
  const output = await captureWithFallback(downloader, ["--skip-download", "--dump-single-json", reelUrl], cwd);
  const info = JSON.parse(output);
  return {
    caption: info.description || info.title || "",
    reelUrl,
    videoUrl: info.url || "",
    ogTitle: info.title || ""
  };
}

export async function downloadReel({ cwd, reelUrl, outputDirectory, downloader = {} }) {
  const directory = path.resolve(cwd, outputDirectory);
  fs.mkdirSync(directory, { recursive: true });
  const outputTemplate = path.join(directory, "%(id)s.%(ext)s");
  await runWithFallback(downloader, ["--no-playlist", "--format", "mp4/best", "--output", outputTemplate, reelUrl], cwd);

  return findDownloadedReel(directory, reelUrl);
}
