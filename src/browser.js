import path from "node:path";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

function chromeIsRunning() {
  if (process.platform !== "win32") return false;
  try {
    const output = execFileSync("tasklist.exe", ["/FI", "IMAGENAME eq chrome.exe", "/NH"], {
      encoding: "utf8",
      windowsHide: true
    });
    return /chrome\.exe/i.test(output);
  } catch {
    return false;
  }
}

export async function openAccountBrowser({ cwd, platform, accountId, headless = false, chromeProfileDirectory }) {
  const usingSystemProfile = Boolean(chromeProfileDirectory && platform !== "instagram");
  let userDataDir = path.join(cwd, ".sessions", platform, accountId);
  if (usingSystemProfile) {
    const sourceRoot = path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "User Data");
    userDataDir = path.join(cwd, ".sessions", "chrome-import", chromeProfileDirectory);
    const importedProfile = path.join(userDataDir, chromeProfileDirectory);
    if (!fs.existsSync(importedProfile)) {
      if (chromeIsRunning()) {
        throw new Error(
          `Chrome must be fully closed for the one-time import of profile '${chromeProfileDirectory}'. ` +
          "Close every Chrome window and background Chrome process, then retry."
        );
      }
      fs.mkdirSync(userDataDir, { recursive: true });
      fs.copyFileSync(path.join(sourceRoot, "Local State"), path.join(userDataDir, "Local State"));
      const ignored = new Set(["Cache", "Code Cache", "GPUCache", "DawnCache", "GrShaderCache", "ShaderCache"]);
      fs.cpSync(path.join(sourceRoot, chromeProfileDirectory), importedProfile, {
        recursive: true,
        filter: (source) => !ignored.has(path.basename(source))
      });
      console.log(`Imported Chrome profile '${chromeProfileDirectory}' into the automation workspace.`);
    }
  }
  try {
    return await chromium.launchPersistentContext(userDataDir, {
      headless,
      channel: "chrome",
      args: usingSystemProfile ? [`--profile-directory=${chromeProfileDirectory}`] : [],
      acceptDownloads: true,
      viewport: { width: 1440, height: 1000 }
    });
  } catch (error) {
    if (usingSystemProfile) {
      throw new Error(`Could not open the automation copy of Chrome profile '${chromeProfileDirectory}'. ${error.message}`);
    }
    throw error;
  }
}

export async function openPublicBrowser({ headless = false } = {}) {
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1440, height: 1000 }
  });
  const closeContext = context.close.bind(context);
  context.close = async () => {
    await closeContext();
    await browser.close();
  };
  return context;
}

export async function pauseForLogin(page, platform) {
  process.stdout.write(`\nLog into ${platform} in the opened window, then return here and press Enter... `);
  await new Promise((resolve) => process.stdin.once("data", resolve));
  await page.waitForTimeout(500);
}
