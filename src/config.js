import fs from "node:fs";
import path from "node:path";

export function loadConfig(cwd = process.cwd()) {
  const filename = path.join(cwd, "config.json");
  if (!fs.existsSync(filename)) {
    throw new Error("Missing config.json. Copy config.example.json to config.json and edit the account labels.");
  }
  const config = JSON.parse(fs.readFileSync(filename, "utf8"));
  config.defaults ??= {};
  config.defaults.mode ??= "draft";
  config.defaults.headless ??= false;
  config.defaults.downloadDirectory ??= "downloads";
  config.defaults.uploadMethod ??= "extension";
  config.defaults.enabledPlatforms ??= ["tiktok", "youtube"];
  config.defaults.deepInstagramDiscovery ??= true;
  config.defaults.deleteAfterYouTubeUpload ??= true;
  config.defaults.instagramDiscoveryMethod ??= "extension";
  config.chromeProfiles ??= {};
  config.downloader ??= {};
  const defaultChromeProfile = resolveChromeProfile(config);
  config.downloader.cookieBrowser ??= `chrome:${defaultChromeProfile?.profileDirectory || config.defaults.chromeProfileDirectory || "Default"}`;
  config.accounts ??= {};
  for (const platform of ["instagram", "tiktok", "youtube"]) config.accounts[platform] ??= {};
  return config;
}

export function resolveChromeProfile(config, requestedId) {
  const id = requestedId || config.defaults?.chromeProfile;
  if (!id) {
    const legacyDirectory = config.defaults?.chromeProfileDirectory;
    return legacyDirectory
      ? { id: null, label: legacyDirectory, profileDirectory: legacyDirectory }
      : null;
  }

  const profiles = config.chromeProfiles || {};
  const configured = profiles[id];
  if (!configured) {
    const choices = Object.keys(profiles).join(", ") || "none configured";
    throw new Error(`Unknown Chrome profile '${id}'. Available: ${choices}`);
  }

  const profile = typeof configured === "string"
    ? { profileDirectory: configured }
    : configured;
  const profileDirectory = profile.profileDirectory;
  if (!profileDirectory || /[\\/]/.test(profileDirectory) || path.basename(profileDirectory) !== profileDirectory || [".", ".."].includes(profileDirectory)) {
    throw new Error(`Chrome profile '${id}' must define a directory name such as 'Default' or 'Profile 2'`);
  }
  return {
    id,
    label: profile.label || id,
    profileDirectory
  };
}

export function requireAccount(config, platform, id) {
  const account = config.accounts?.[platform]?.[id];
  if (!account) {
    const choices = Object.keys(config.accounts?.[platform] ?? {}).join(", ") || "none configured";
    throw new Error(`Unknown ${platform} account '${id}'. Available: ${choices}`);
  }
  return { id, ...account };
}
