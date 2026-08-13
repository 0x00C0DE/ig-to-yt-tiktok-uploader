import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const HOST = "127.0.0.1";
const PORT = 43117;

export function selectQueuedJob(jobs, chromeProfile, capabilities = {}) {
  return jobs.find((item) =>
    item.status === "queued" &&
    (!item.chromeProfile || item.chromeProfile === chromeProfile) &&
    (item.platform !== "tiktok-session" || capabilities.tiktokSession === true)
  );
}

function json(response, status, value) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
  });
  response.end(JSON.stringify(value));
}

export class ExtensionBridge {
  constructor({ chromeProfile = null } = {}) {
    this.chromeProfile = chromeProfile;
    this.jobs = new Map();
    this.server = null;
  }

  async start() {
    if (this.server) return;
    this.server = http.createServer((request, response) => this.handle(request, response));
    await new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(PORT, HOST, resolve);
    });
  }

  async stop() {
    if (!this.server) return;
    await new Promise((resolve) => this.server.close(resolve));
    this.server = null;
  }

  enqueue({ platform, videoPath, metadata, mode }) {
    const id = crypto.randomUUID();
    const job = {
      id, platform, videoPath: videoPath || null,
      filename: videoPath ? path.basename(videoPath) : null, chromeProfile: this.chromeProfile,
      metadata, mode, status: "queued", message: "", result: null
    };
    this.jobs.set(id, job);
    return job;
  }

  enqueueDiscovery({ handle, maxReels }) {
    return this.enqueue({
      platform: "instagram",
      videoPath: null,
      metadata: { handle, maxReels: Number.isFinite(maxReels) ? maxReels : null },
      mode: "discover"
    });
  }

  enqueueTikTokSession({ accountHandle }) {
    return this.enqueue({
      platform: "tiktok-session",
      videoPath: null,
      metadata: { accountHandle },
      mode: "setup"
    });
  }

  wait(job, timeout = 10 * 60_000) {
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + timeout;
      const timer = setInterval(() => {
        if (["prepared", "completed"].includes(job.status)) { clearInterval(timer); resolve(job); }
        else if (job.status === "failed") { clearInterval(timer); reject(new Error(job.message || "Extension upload failed")); }
        else if (Date.now() > deadline) {
          clearInterval(timer);
          const profileHint = job.chromeProfile ? ` configured as '${job.chromeProfile}'` : "";
          reject(new Error(`Timed out waiting for the Chrome extension${profileHint}. Open that Chrome profile, click the extension icon, and choose Check for upload.`));
        }
      }, 500);
    });
  }

  async handle(request, response) {
    if (request.method === "OPTIONS") return json(response, 204, {});
    const url = new URL(request.url, `http://${HOST}:${PORT}`);
    if (url.pathname === "/health") {
      return json(response, 200, { ok: true, chromeProfile: this.chromeProfile });
    }
    if (url.pathname === "/api/jobs/next") {
      const requestedProfile = url.searchParams.get("chromeProfile");
      const job = selectQueuedJob([...this.jobs.values()], requestedProfile, {
        tiktokSession: url.searchParams.get("tiktokSession") === "1"
      });
      if (!job) return json(response, 200, {});
      job.status = "claimed";
      return json(response, 200, { id: job.id, platform: job.platform });
    }
    const match = url.pathname.match(/^\/api\/jobs\/([^/]+)(?:\/(media|status))?$/);
    const job = match && this.jobs.get(match[1]);
    if (!job) return json(response, 404, { error: "Job not found" });
    if (match[2] === "media" && request.method === "GET") {
      response.writeHead(200, { "Content-Type": "video/mp4", "Access-Control-Allow-Origin": "*" });
      return fs.createReadStream(job.videoPath).pipe(response);
    }
    if (match[2] === "status" && request.method === "POST") {
      let body = "";
      for await (const chunk of request) body += chunk;
      const update = JSON.parse(body || "{}");
      job.status = update.status;
      job.message = update.message || "";
      job.result = update.result ?? job.result;
      return json(response, 200, { ok: true });
    }
    const { videoPath: localPath, ...publicJob } = job;
    return json(response, 200, { ...publicJob, localPath });
  }
}
