export async function readReelMetadata(page, reelUrl) {
  await page.goto(reelUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(2500);

  const metadata = await page.evaluate(() => {
    const meta = (property) => document.querySelector(`meta[property="${property}"]`)?.content || "";
    const ogDescription = meta("og:description");
    const ogTitle = meta("og:title");
    const videoUrl = meta("og:video") || meta("og:video:secure_url");
    const captionNodes = [...document.querySelectorAll("article h1, article span")]
      .map((node) => node.textContent?.trim() || "")
      .filter((text) => text.length > 0);
    let caption = captionNodes.sort((a, b) => b.length - a.length)[0] || "";
    if (!caption && ogDescription) {
      const match = ogDescription.match(/(?:on Instagram:\s*[“\"])([\s\S]*?)(?:[”\"]\.?$)/);
      caption = match?.[1] || ogDescription;
    }
    return { caption, videoUrl, ogTitle };
  });

  if (!metadata.caption) {
    throw new Error("Could not read the Reel caption. Confirm the selected Instagram session can view this Reel.");
  }
  return { ...metadata, reelUrl };
}

export function canonicalReelUrl(value) {
  const match = String(value).match(/instagram\.com\/(?:[a-zA-Z0-9._]+\/)?reel\/([^/?#]+)/i);
  if (!match) return null;
  return `https://www.instagram.com/reel/${match[1]}/`;
}

async function discoverWithInstaloader(cwd, handle, maxReels, timeout = 5 * 60_000) {
  const script = path.join(cwd, "scripts", "instagram_discovery.py");
  const maximum = Number.isFinite(maxReels) ? String(maxReels) : "0";
  return new Promise((resolve, reject) => {
    const child = spawn("python", [script, handle, maximum], { cwd, windowsHide: true });
    const found = new Set();
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Deep Instagram discovery timed out after ${Math.round(timeout / 60000)} minutes`));
    }, timeout);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      const lines = stdout.split(/\r?\n/);
      stdout = lines.pop() || "";
      for (const line of lines) {
        const canonical = canonicalReelUrl(line.trim());
        if (canonical) found.add(canonical);
      }
    });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code) => {
      clearTimeout(timer);
      const canonical = canonicalReelUrl(stdout.trim());
      if (canonical) found.add(canonical);
      if (code === 0 && found.size) resolve([...found]);
      else reject(new Error(stderr.trim() || `Instaloader discovery exited with code ${code}`));
    });
  });
}

export async function discoverReels(page, handle, {
  maxReels = Infinity,
  cwd = process.cwd(),
  deepDiscovery = true
} = {}) {
  const normalizedHandle = String(handle).replace(/^@/, "").trim();
  if (!/^[a-zA-Z0-9._]+$/.test(normalizedHandle)) throw new Error(`Invalid Instagram handle '${handle}'.`);

  if (deepDiscovery && maxReels > 12) {
    try {
      const deep = await discoverWithInstaloader(cwd, normalizedHandle, maxReels);
      if (deep.length > 12) return deep.slice(0, maxReels);
    } catch (error) {
      console.warn(`Deep Instagram discovery unavailable: ${error.message}`);
    }
  }

  await page.goto(`https://www.instagram.com/${normalizedHandle}/reels/`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000
  });
  await page.waitForTimeout(2500);

  const found = new Set();
  let stagnantPasses = 0;
  let previousHeight = 0;
  while (found.size < maxReels && stagnantPasses < 20) {
    const hrefs = await page.locator('a[href*="/reel/"]').evaluateAll((links) => links.map((link) => link.href));
    const before = found.size;
    for (const href of hrefs) {
      const canonical = canonicalReelUrl(href);
      if (canonical) found.add(canonical);
      if (found.size >= maxReels) break;
    }
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    stagnantPasses = found.size === before && height === previousHeight ? stagnantPasses + 1 : 0;
    previousHeight = height;
    const lastReel = page.locator('a[href*="/reel/"]').last();
    await lastReel.scrollIntoViewIfNeeded().catch(() => {});
    await page.evaluate(() => window.scrollBy(0, Math.max(window.innerHeight * 0.85, 600)));
    await page.waitForTimeout(2000);
  }

  if (!found.size) {
    throw new Error(`No Reels were found for @${normalizedHandle}. Confirm the handle and that this Instagram session can view the profile.`);
  }
  if (deepDiscovery && maxReels > 12 && found.size <= 12) {
    throw new Error(
      `Instagram exposed only ${found.size} Reel(s) for @${normalizedHandle}. ` +
      "Anonymous Instagram access is currently capped or rate-limited; the result is not treated as the full profile. " +
      "Retry later, configure an Instagram source session, or use a third-party discovery provider."
    );
  }
  return [...found].slice(0, maxReels);
}
import path from "node:path";
import { spawn } from "node:child_process";
