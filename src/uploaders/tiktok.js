async function findEditor(page) {
  const selectors = ['div[contenteditable="true"]', 'textarea[placeholder*="caption" i]', 'textarea'];
  for (const selector of selectors) {
    const item = page.locator(selector).first();
    if (await item.isVisible().catch(() => false)) return item;
  }
  return null;
}

async function waitForManualLogin(page) {
  if (!/\/login/i.test(page.url())) return;
  process.stdout.write("TikTok is signed out in the automation Chrome profile. Log in in the opened window, then press Enter here... ");
  await new Promise((resolve) => process.stdin.once("data", resolve));
  await page.goto("https://www.tiktok.com/tiktokstudio/upload", { waitUntil: "domcontentloaded", timeout: 60_000 });
}

export async function uploadTikTok({ page, videoPath, metadata, mode }) {
  await page.goto("https://www.tiktok.com/tiktokstudio/upload", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(2500);
  await waitForManualLogin(page);
  const input = page.locator('input[type="file"]').first();
  await input.waitFor({ timeout: 30_000 });
  await input.setInputFiles(videoPath);

  let editor;
  for (let i = 0; i < 30 && !editor; i++) {
    editor = await findEditor(page);
    if (!editor) await page.waitForTimeout(1000);
  }
  if (!editor) throw new Error("TikTok caption editor was not found after upload.");
  await editor.fill(metadata.caption);

  if (mode === "publish") {
    const post = page.getByRole("button", { name: /^Post$/i }).last();
    await post.waitFor({ timeout: 60_000 });
    await post.click();
  } else {
    console.log("TikTok upload populated. Leaving it open for review.");
  }
}
