(async () => {
  const bridge = globalThis.ReelBridge;
  const id = await bridge.jobId();
  if (!id) return;
  try {
    const job = await bridge.job(id);
    const create = await bridge.visible(['button[aria-label*="Create"]', "#create-icon"]);
    create.click();
    const uploadItem = await bridge.elementByText(
      ['tp-yt-paper-item', 'ytcp-text-menu tp-yt-paper-item', '[role="menuitem"]'],
      /^Upload videos?$/i
    );
    uploadItem.click();
    await bridge.element(['input[type="file"]']);
    await bridge.setLocalFile(id);
    const title = await bridge.visible([
      '#title-textarea #textbox',
      'ytcp-social-suggestions-textbox#title-textarea #textbox',
      '#textbox[aria-label*="title" i]'
    ]);
    const description = await bridge.visible([
      '#description-textarea #textbox',
      'ytcp-social-suggestions-textbox#description-textarea #textbox',
      '#textbox[aria-label*="description" i]'
    ]);
    await bridge.ensureFilled(title, job.metadata.title);
    await bridge.ensureFilled(description, job.metadata.description);
    const notKids = document.querySelector('tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]');
    notKids?.click();
    if (job.mode === "publish") {
      for (let step = 0; step < 3; step++) (await bridge.button(/^Next$/i)).click();
      const publicOption = await bridge.element(['tp-yt-paper-radio-button[name="PUBLIC"]']);
      publicOption.click();
      const publish = await bridge.button(/^(Publish|Save)$/i, 180000);
      publish.click();
      const deadline = Date.now() + 180000;
      let confirmed = false;
      let processing = false;
      while (Date.now() < deadline) {
        const body = document.body?.innerText || "";
        const dialog = document.querySelector('ytcp-uploads-dialog, ytcp-video-upload-dialog');
        if (/Video processing/i.test(body) && /needs to finish processing before your video is public/i.test(body)) {
          confirmed = true;
          processing = true;
          break;
        }
        if (/Video published|Your video has been published|published successfully/i.test(body) || !dialog) {
          confirmed = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      if (!confirmed) throw new Error("YouTube did not confirm publication before timeout");
      await bridge.report(
        id,
        "completed",
        processing ? "YouTube upload accepted; video processing continues" : "YouTube publication confirmed"
      );
      await chrome.runtime.sendMessage({ type: "closeUploadTab" });
    } else {
      await bridge.report(id, "prepared", "YouTube upload populated for review");
    }
  } catch (error) {
    await bridge.report(id, "failed", error.message).catch(() => {});
  }
})();
