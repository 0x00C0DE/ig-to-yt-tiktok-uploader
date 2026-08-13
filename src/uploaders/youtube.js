async function firstVisible(page, selectors) {
  for (const selector of selectors) {
    const target = page.locator(selector).first();
    if (await target.isVisible().catch(() => false)) return target;
  }
  return null;
}

async function waitForManualLogin(page) {
  if (!/accounts\.google\.com|\/signin/i.test(page.url())) return;
  process.stdout.write("YouTube is signed out in the automation Chrome profile. Log in in the opened window, then press Enter here... ");
  await new Promise((resolve) => process.stdin.once("data", resolve));
  await page.goto("https://studio.youtube.com", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(3000);
}

export async function uploadYouTube({ page, videoPath, metadata, mode }) {
  await page.goto("https://studio.youtube.com", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await waitForManualLogin(page);
  const create = await firstVisible(page, ['button[aria-label*="Create"]', '#create-icon']);
  if (!create) throw new Error(`YouTube Studio is not ready at ${page.url()}. Confirm the signed-in account has a YouTube channel.`);
  await create.click();
  const upload = await firstVisible(page, ['tp-yt-paper-item:has-text("Upload videos")', 'text="Upload videos"']);
  await upload?.click();
  const input = page.locator('input[type="file"]');
  await input.setInputFiles(videoPath);

  const title = page.locator('#textbox[aria-label*="title" i]').first();
  const description = page.locator('#textbox[aria-label*="description" i]').first();
  await title.waitFor({ timeout: 30_000 });
  await title.fill(metadata.title);
  await description.fill(metadata.description);

  const notKids = page.locator('tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]');
  if (await notKids.isVisible().catch(() => false)) await notKids.click();

  if (mode === "publish") {
    for (let i = 0; i < 3; i++) {
      const next = await firstVisible(page, ['#next-button']);
      if (next) await next.click();
    }
    const publicOption = page.locator('tp-yt-paper-radio-button[name="PUBLIC"]');
    if (await publicOption.isVisible().catch(() => false)) await publicOption.click();
    const done = await firstVisible(page, ['#done-button']);
    await done?.click();
  } else {
    console.log("YouTube upload populated. Leaving the upload dialog open for review.");
  }
}
