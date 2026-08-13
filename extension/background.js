import { selectTikTokSessionCookies } from "./tiktok-session.js";

const BRIDGE = "http://127.0.0.1:43117";
const activeSessionCaptures = new Set();

async function report(jobId, status, message = "", result = null) {
  const response = await fetch(`${BRIDGE}/api/jobs/${encodeURIComponent(jobId)}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, message, result })
  });
  if (!response.ok) throw new Error(`Could not report job status (${response.status})`);
}

async function captureTikTokSession(tabId, jobId) {
  if (activeSessionCaptures.has(tabId)) return false;
  activeSessionCaptures.add(tabId);
  const target = { tabId };
  let attached = false;
  try {
    await chrome.debugger.attach(target, "1.3");
    attached = true;
    const response = await chrome.debugger.sendCommand(target, "Network.getCookies", {
      urls: ["https://www.tiktok.com/"]
    });
    const selection = selectTikTokSessionCookies(response.cookies);
    if (!selection.ready) return false;

    await report(jobId, "completed", "TikTok session captured from the selected Chrome profile", {
      cookies: selection.cookies
    });
    await chrome.storage.session.remove(`tiktok_session_job_${tabId}`);
    await chrome.tabs.remove(tabId).catch(() => {});
    return true;
  } finally {
    if (attached) await chrome.debugger.detach(target).catch(() => {});
    activeSessionCaptures.delete(tabId);
  }
}

async function capturePendingTikTokSessions() {
  const stored = await chrome.storage.session.get(null);
  const pending = Object.entries(stored)
    .filter(([key, value]) => key.startsWith("tiktok_session_job_") && value)
    .map(([key, jobId]) => ({ tabId: Number(key.slice("tiktok_session_job_".length)), jobId }));
  for (const item of pending) {
    await captureTikTokSession(item.tabId, item.jobId).catch(() => {});
  }
}

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
      const parameters = new URLSearchParams({ tiktokSession: "1" });
      if (chromeProfile) parameters.set("chromeProfile", chromeProfile);
      const query = `?${parameters.toString()}`;
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
      } else if (job.platform === "tiktok-session") {
        const tab = await chrome.tabs.create({
          url: "https://www.tiktok.com/",
          active: true
        });
        await chrome.storage.session.set({ [`tiktok_session_job_${tab.id}`]: job.id });
        await captureTikTokSession(tab.id, job.id).catch(() => {});
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
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "reel-bridge") {
    poll().then(capturePendingTikTokSessions).catch(() => {});
  }
});
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
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== "complete") return;
  const key = `tiktok_session_job_${tabId}`;
  chrome.storage.session.get(key).then((value) => {
    if (value[key]) return captureTikTokSession(tabId, value[key]);
  }).catch(() => {});
});
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const uploadKey = `job_${tabId}`;
  const sessionKey = `tiktok_session_job_${tabId}`;
  const stored = await chrome.storage.session.get([uploadKey, sessionKey]).catch(() => ({}));
  await chrome.storage.session.remove([uploadKey, sessionKey]).catch(() => {});
  if (stored[sessionKey]) {
    await report(stored[sessionKey], "failed", "TikTok setup tab closed before the session was captured").catch(() => {});
  }
});
poll();
