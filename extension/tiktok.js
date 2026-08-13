(async () => {
  const bridge = globalThis.ReelBridge;
  const id = await bridge.jobId();
  if (!id) return;

  try {
    const job = await bridge.job(id);
    await bridge.element(['input[type="file"]']);
    await bridge.setLocalFile(id);

    const editor = await bridge.visible([
      '[contenteditable="true"][role="textbox"]',
      '[contenteditable="true"]',
      '[role="textbox"]',
      'textarea[placeholder*="caption" i]',
      'textarea[placeholder*="description" i]',
      "textarea"
    ], 180000);
    bridge.fill(editor, job.metadata.caption);

    await bridge.bodyText(/Uploaded|Upload complete/i);
    (await bridge.button(/^Post$/i, 300000)).click();
    (await bridge.button(/^Post now$/i, 180000)).click();
    await bridge.bodyText(
      /Your video (?:has been|is being) (?:posted|uploaded)|Post submitted|Manage your posts/i,
      120000
    );
    await bridge.report(id, "completed", "TikTok publication confirmed");
  } catch (error) {
    await bridge.report(id, "failed", error.message).catch(() => {});
  }
})();
