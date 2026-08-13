const BRIDGE = "http://127.0.0.1:43117";

async function setLocalFile(tabId, jobId) {
  const response = await fetch(`${BRIDGE}/api/jobs/${encodeURIComponent(jobId)}`);
  if (!response.ok) throw new Error(`Could not load upload job (${response.status})`);
  const job = await response.json();
  const target = { tabId };
  await chrome.debugger.attach(target, "1.3");
  try {
    const documentNode = await chrome.debugger.sendCommand(target, "DOM.getDocument", {
      depth: -1,
      pierce: true
    });
    const result = await chrome.debugger.sendCommand(target, "DOM.querySelector", {
      nodeId: documentNode.root.nodeId,
      selector: 'input[type="file"]'
    });
    if (!result.nodeId) throw new Error("Native file input was not found");
    await chrome.debugger.sendCommand(target, "DOM.setFileInputFiles", {
      nodeId: result.nodeId,
      files: [job.localPath]
    });
  } finally {
    await chrome.debugger.detach(target).catch(() => {});
  }
}

let polling = false;
async function poll() {
  if (polling) return;
  polling = true;
  try {
    const stored = await chrome.storage.local.get("chromeProfile");
    const chromeProfile = String(stored.chromeProfile || "").trim();
    for (let index = 0; index < 5; index++) {
      const query = chromeProfile ? `?chromeProfile=${encodeURIComponent(chromeProfile)}` : "";
      const response = await fetch(`${BRIDGE}/api/jobs/next${query}`);
      if (!response.ok) break;
      const job = await response.json();
      if (!job?.id) break;
      if (job.platform === "instagram") {
        const detailsResponse = await fetch(`${BRIDGE}/api/jobs/${encodeURIComponent(job.id)}`);
        const details = await detailsResponse.json();
        const handle = String(details.metadata.handle || "").replace(/^@/, "");
        const tab = await chrome.tabs.create({
          url: `https://www.instagram.com/${encodeURIComponent(handle)}/reels/`,
          active: true
        });
        await chrome.storage.session.set({ [`job_${tab.id}`]: job.id });
      } else if (job.platform === "tiktok") {
        const tab = await chrome.tabs.create({
          url: "https://www.tiktok.com/tiktokstudio/upload",
          active: true
        });
        await chrome.storage.session.set({ [`job_${tab.id}`]: job.id });
      } else {
        const tab = await chrome.tabs.create({ url: "about:blank", active: true });
        await chrome.storage.session.set({ [`job_${tab.id}`]: job.id });
        await chrome.tabs.update(tab.id, { url: "https://studio.youtube.com/" });
      }
    }
  } catch {
    // The local harness is normally offline; retry on the next alarm.
  } finally {
    polling = false;
  }
}

chrome.runtime.onInstalled.addListener(() => chrome.alarms.create("reel-bridge", { periodInMinutes: 0.5 }));
chrome.runtime.onStartup.addListener(() => chrome.alarms.create("reel-bridge", { periodInMinutes: 0.5 }));
chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === "reel-bridge") poll(); });
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "poll") {
    poll().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === "getJobId") {
    const tabId = _sender.tab?.id;
    if (!tabId) { sendResponse({ id: null }); return false; }
    chrome.storage.session.get(`job_${tabId}`).then(async (value) => {
      const key = `job_${tabId}`;
      const id = value[key] || null;
      if (id) await chrome.storage.session.remove(key);
      sendResponse({ id });
    });
    return true;
  }
  if (message?.type === "setFileInput") {
    const tabId = _sender.tab?.id;
    if (!tabId) {
      sendResponse({ ok: false, error: "No Chrome tab was associated with this upload" });
      return false;
    }
    setLocalFile(tabId, message.jobId)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "closeUploadTab") {
    const tabId = _sender.tab?.id;
    if (!tabId) {
      sendResponse({ ok: false, error: "No Chrome tab was associated with this upload" });
      return false;
    }
    chrome.tabs.remove(tabId)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  return false;
});
chrome.tabs.onRemoved.addListener((tabId) => chrome.storage.session.remove(`job_${tabId}`));
poll();
