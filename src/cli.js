#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { describeChromeProfile, loadConfig, requireAccount, resolveChromeProfile } from "./config.js";
import { openAccountBrowser, openPublicBrowser, pauseForLogin } from "./browser.js";
import { canonicalReelUrl, discoverReels, readReelMetadata } from "./instagram.js";
import { mapMetadata } from "./metadata.js";
import { downloadReel, probeReel } from "./downloader.js";
import { TransferState } from "./state.js";
import { uploadTikTok } from "./uploaders/tiktok.js";
import { uploadTikTokApi } from "./uploaders/tiktok-api.js";
import { uploadYouTube } from "./uploaders/youtube.js";
import { ExtensionBridge } from "./extension-bridge.js";
import { selectDestinations } from "./destinations.js";
import { removeUploadedVideo } from "./cleanup.js";
import { UploadManager } from "./upload-manager.js";
import { loginTikTokAutoUploader, uploadTikTokAutoUploader } from "./uploaders/tiktok-auto-uploader.js";

function parseArgs(argv) {
  const [command = "help", ...rest] = argv;
  const options = {};
  for (let i = 0; i < rest.length; i++) {
    if (!rest[i].startsWith("--")) continue;
    const key = rest[i].slice(2);
    const next = rest[i + 1];
    options[key] = next && !next.startsWith("--") ? rest[++i] : true;
  }
  return { command, options };
}

function usage() {
  console.log(`Social Reel Bridge

Setup a stored login:
  npm run setup -- --platform tiktok --account tt-main --chrome-profile personal
  npm run setup -- --platform youtube --account yt-main

Transfer one Reel:
  npm run run -- --reel URL --tiktok tt-main --youtube yt-main --mode publish

Synchronize all accessible Reels from a handle:
  node src/cli.js sync --handle @myhandle --tiktok tt-main --youtube yt-main --mode publish

Limit a run to one destination:
  node src/cli.js sync --handle @myhandle --tiktok tt-main --youtube yt-main --platforms youtube --mode publish

Select a configured Chrome profile for this run:
  node src/cli.js sync --handle @myhandle --youtube yt-main --chrome-profile work --mode publish

Open the editable transfer ledger:
  node src/cli.js ledger

Destination flags are optional; specify either or both. Use --platforms tiktok, youtube, or tiktok,youtube. Mode is draft or publish; TikTok API and TikTokAutoUploader accounts require publish.
Instagram login is optional and needed only for private or login-blocked sources.`);
}

function isUnavailableReelError(error) {
  const message = String(error?.message || error);
  return /content isn(?:'|’)t available to everyone|can't be seen by certain audiences|not available|private|login required|video unavailable/i.test(message);
}

async function setup(cwd, options) {
  const config = loadConfig(cwd);
  const platform = options.platform;
  const accountId = options.account;
  if (!["instagram", "tiktok", "youtube"].includes(platform) || !accountId) throw new Error("setup requires --platform and --account");
  const account = requireAccount(config, platform, accountId);
  const chromeProfile = resolveChromeProfile(config, options["chrome-profile"]);
  if (platform === "tiktok" && account.uploadMethod === "tiktok-auto-uploader") {
    console.log(`[TikTok][${account.handle || account.label || accountId}] Opening TikTokAutoUploader login...`);
    const result = await loginTikTokAutoUploader({ cwd, account });
    console.log(result.message);
    return;
  }
  const urls = { instagram: "https://www.instagram.com/", tiktok: "https://www.tiktok.com/", youtube: "https://studio.youtube.com/" };
  const context = await openAccountBrowser({
    cwd, platform, accountId, headless: false,
    chromeProfileDirectory: chromeProfile?.profileDirectory
  });
  const page = context.pages()[0] || await context.newPage();
  await page.goto(urls[platform], { waitUntil: "domcontentloaded" });
  await pauseForLogin(page, platform);
  await context.close();
  console.log(`Saved ${platform} session '${accountId}'.`);
}

function transferOptions(config, options) {
  const instagramId = options.instagram || "public";
  const mode = options.mode || config.defaults.mode;
  if (!["draft", "publish"].includes(mode)) throw new Error("--mode must be draft or publish");
  if (instagramId !== "public") requireAccount(config, "instagram", instagramId);
  const destinations = selectDestinations(options, config.defaults.enabledPlatforms);
  if (!destinations.length) throw new Error("Specify at least one destination with --tiktok or --youtube");
  for (const [platform, id] of destinations) requireAccount(config, platform, id);
  const chromeProfile = resolveChromeProfile(config, options["chrome-profile"]);
  return { instagramId, mode, destinations, chromeProfile };
}

async function transferOne({ cwd, config, reelUrl, instagramId, mode, destinations, chromeProfile, state, bridge }) {
  const pending = destinations.filter(([platform, accountId]) => !state.has(instagramId, reelUrl, platform, accountId));
  if (!pending.length) {
    console.log(`Skipping ${reelUrl}: verified complete for every selected destination.`);
    return { skipped: true };
  }
  for (const [platform, accountId] of pending) {
    const previous = state.status(instagramId, reelUrl, platform, accountId);
    if (previous && previous !== "completed") console.log(`Retrying ${platform}/${accountId}; previous status was ${previous}.`);
  }
  let source;
  const downloader = chromeProfile?.profileDirectory
    ? { ...config.downloader, cookieBrowser: `chrome:${chromeProfile.profileDirectory}` }
    : config.downloader;
  if (instagramId === "public" || config.defaults.instagramDiscoveryMethod === "extension") {
    try {
      source = await probeReel({ cwd, reelUrl, downloader });
    } catch (probeError) {
      if (config.defaults.instagramDiscoveryMethod === "extension") {
        throw new Error(`Could not read Reel metadata without opening another browser: ${probeError.message}`);
      }
      const sourceContext = await openPublicBrowser({ headless: true });
      try { source = await readReelMetadata(sourceContext.pages()[0] || await sourceContext.newPage(), reelUrl); }
      catch { throw new Error(`Could not read this public Reel without login: ${probeError.message}`); }
      finally { await sourceContext.close(); }
    }
  } else {
    const sourceContext = await openAccountBrowser({
      cwd, platform: "instagram", accountId: instagramId, headless: config.defaults.headless,
      chromeProfileDirectory: chromeProfile?.profileDirectory
    });
    try { source = await readReelMetadata(sourceContext.pages()[0] || await sourceContext.newPage(), reelUrl); }
    finally { await sourceContext.close(); }
  }
  const metadata = mapMetadata(source);
  const videoPath = await downloadReel({ cwd, reelUrl, outputDirectory: config.defaults.downloadDirectory, downloader });
  console.log(`Downloaded ${path.basename(videoPath)}; caption preserved (${[...metadata.source.caption].length} characters).`);

  async function cleanupCompletedVideo() {
    if (!config.defaults.deleteAfterYouTubeUpload) return;
    const selectedComplete = destinations.every(([platform, accountId]) =>
      state.has(instagramId, reelUrl, platform, accountId)
    );
    const youtubeConfirmed = Object.keys(config.accounts.youtube || {}).some((accountId) =>
      state.has(instagramId, reelUrl, "youtube", accountId)
    );
    if (!selectedComplete || !youtubeConfirmed) return;
    const removed = await removeUploadedVideo({
      cwd,
      downloadDirectory: config.defaults.downloadDirectory,
      videoPath
    });
    if (removed) console.log(`Deleted local video ${path.basename(videoPath)} after verified uploads; ledger identifiers retained.`);
  }

  if (config.defaults.uploadMethod === "extension") {
    const extensionUpload = async ({ platform, videoPath: localPath, metadata: platformMetadata, mode: uploadMode }) => {
      const job = bridge.enqueue({ platform, videoPath: localPath, metadata: platformMetadata, mode: uploadMode });
      console.log(`Queued ${platform} extension upload.`);
      const result = await bridge.wait(job);
      return { ...result, uploadMethod: "extension" };
    };
    const manager = new UploadManager({
      state,
      resolveAccount: (platform, accountId) => requireAccount(config, platform, accountId),
      uploaders: {
        youtube: extensionUpload,
        tiktok: async (context) => {
          if (context.account.uploadMethod === "api") {
            return { ...(await uploadTikTokApi(context)), uploadMethod: "api" };
          }
          if (context.account.uploadMethod === "tiktok-auto-uploader") {
            return uploadTikTokAutoUploader({ cwd, ...context });
          }
          return extensionUpload(context);
        }
      },
      onPrepared: async ({ platform, accountId, result }) => {
        console.log(`${platform}/${accountId}: ${result.message}. Complete or save it in Chrome, then press Enter here.`);
        await new Promise((resolve) => process.stdin.once("data", resolve));
      }
    });
    console.log("Selected platform uploads start concurrently. The next Reel waits for every selected destination result.");
    const results = await manager.upload({
      sourceAccount: instagramId, reelUrl, videoPath, metadata, mode, destinations: pending
    });
    const failures = Object.values(results).filter((result) => result.status === "failed");
    if (failures.length) throw new Error(`${failures.length} destination upload(s) failed or require review.`);
    await cleanupCompletedVideo();
    return { skipped: false };
  }

  for (const [platform, accountId] of pending) {
    state.begin(instagramId, reelUrl, platform, accountId);
    const context = await openAccountBrowser({
      cwd, platform, accountId, headless: false,
      chromeProfileDirectory: chromeProfile?.profileDirectory
    });
    const page = context.pages()[0] || await context.newPage();
    try {
      if (platform === "tiktok") await uploadTikTok({ page, videoPath, metadata: metadata.tiktok, mode });
      else await uploadYouTube({ page, videoPath, metadata: metadata.youtube, mode });
      if (mode === "publish") {
        state.complete(instagramId, reelUrl, platform, accountId, { videoPath });
        await context.close();
      } else {
        console.log(`Review ${platform}/${accountId} in the browser. Press Enter after publishing or saving, or Ctrl+C to leave unrecorded.`);
        await new Promise((resolve) => process.stdin.once("data", resolve));
        state.complete(instagramId, reelUrl, platform, accountId, { videoPath, reviewed: true });
        await context.close();
      }
    } catch (error) {
      state.needsReview(instagramId, reelUrl, platform, accountId, error);
      await context.close();
      throw error;
    }
  }
  await cleanupCompletedVideo();
  return { skipped: false };
}

async function transfer(cwd, options) {
  const config = loadConfig(cwd);
  const reelUrl = canonicalReelUrl(options.reel);
  if (!reelUrl) throw new Error("transfer requires a valid Instagram Reel URL in --reel");
  const selected = transferOptions(config, options);
  const bridge = config.defaults.uploadMethod === "extension"
    ? new ExtensionBridge({ chromeProfile: selected.chromeProfile?.id })
    : null;
  if (bridge) await bridge.start();
  try {
    const result = await transferOne({ cwd, config, reelUrl, ...selected, state: new TransferState(cwd), bridge });
  }
  finally { await bridge?.stop(); }
}

async function sync(cwd, options) {
  const config = loadConfig(cwd);
  if (!options.handle) throw new Error("sync requires --handle");
  const selected = transferOptions(config, options);
  const parsedMaximum = options.max ? Number.parseInt(options.max, 10) : Infinity;
  if (!(parsedMaximum > 0)) throw new Error("--max must be a positive integer");

  const state = new TransferState(cwd);
  const bridge = config.defaults.uploadMethod === "extension"
    ? new ExtensionBridge({ chromeProfile: selected.chromeProfile?.id })
    : null;
  if (bridge) await bridge.start();
  let reels;
  let completed = 0;
  let skipped = 0;
  let inaccessible = 0;
  try {
    if (bridge && config.defaults.instagramDiscoveryMethod === "extension") {
      const profileDescription = describeChromeProfile(selected.chromeProfile);
      console.log(`Requesting Reel discovery for @${String(options.handle).replace(/^@/, "")} in ${profileDescription}...`);
      const discovery = bridge.enqueueDiscovery({ handle: options.handle, maxReels: parsedMaximum });
      const result = await bridge.wait(discovery, 20 * 60_000);
      reels = result.result?.reels;
      if (!Array.isArray(reels) || !reels.length) throw new Error("The Chrome extension returned no Instagram Reel URLs");
    } else {
      const context = selected.instagramId === "public" && !selected.chromeProfile
        ? await openPublicBrowser({ headless: true })
        : await openAccountBrowser({
          cwd, platform: "instagram", accountId: selected.instagramId, headless: config.defaults.headless,
          chromeProfileDirectory: selected.chromeProfile?.profileDirectory
        });
      try {
        const authenticatedDiscovery = selected.instagramId !== "public";
        console.log(authenticatedDiscovery
          ? `Discovering Reels for @${String(options.handle).replace(/^@/, "")} with Instagram session '${selected.instagramId}'...`
          : `Discovering public Reels for @${String(options.handle).replace(/^@/, "")}...`);
        reels = await discoverReels(context.pages()[0] || await context.newPage(), options.handle, {
          maxReels: parsedMaximum,
          cwd,
          deepDiscovery: !authenticatedDiscovery && config.defaults.deepInstagramDiscovery
        });
      } finally {
        await context.close();
      }
    }
    console.log(`Discovered ${reels.length} accessible Reel(s) for ${options.handle}.`);

    for (const [index, reelUrl] of reels.entries()) {
      console.log(`\n[${index + 1}/${reels.length}] ${reelUrl}`);
      try {
        const result = await transferOne({ cwd, config, reelUrl, ...selected, state, bridge });
        if (result.skipped) skipped++;
        else completed++;
      } catch (error) {
        if (!isUnavailableReelError(error)) throw error;
        for (const [platform, accountId] of selected.destinations) {
          if (!state.has(selected.instagramId, reelUrl, platform, accountId)) {
            state.unavailable(selected.instagramId, reelUrl, platform, accountId, error);
          }
        }
        inaccessible++;
        console.warn(`Skipping inaccessible Reel and continuing: ${error.message}`);
      }
    }
  } finally {
    await bridge?.stop();
  }
  console.log(`Sync finished: ${completed} processed, ${skipped} verified complete, ${inaccessible} inaccessible.`);
}

const cwd = process.cwd();
const { command, options } = parseArgs(process.argv.slice(2));
try {
  if (command === "setup") await setup(cwd, options);
  else if (command === "transfer") await transfer(cwd, options);
  else if (command === "sync") await sync(cwd, options);
  else if (command === "ledger") {
    const state = new TransferState(cwd);
    spawn("notepad.exe", [state.filename], { detached: true, stdio: "ignore" }).unref();
    console.log(`Opened ${state.filename}`);
  }
  else usage();
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
}
