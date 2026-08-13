import fs from "node:fs";
import path from "node:path";

const HEADERS = ["source_account", "reel_id", "reel_url", "platform", "destination_account", "status", "updated_at", "note"];

function reelId(url) {
  return String(url).match(/\/reel\/([^/?#]+)/i)?.[1] || "unknown";
}

function clean(value) {
  return String(value ?? "").replace(/[\t\r\n]+/g, " ").trim();
}

export class TransferState {
  constructor(cwd) {
    this.filename = path.join(cwd, "state", "ledger.tsv");
    fs.mkdirSync(path.dirname(this.filename), { recursive: true });
    this.data = {};
    if (fs.existsSync(this.filename)) this.loadTsv();
    else this.migrateJson(cwd);
    this.save();
  }

  key(sourceAccount, reelUrl, platform, destinationAccount) {
    return `${sourceAccount}|${reelUrl}|${platform}|${destinationAccount}`;
  }

  loadTsv() {
    const lines = fs.readFileSync(this.filename, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
    for (const line of lines.slice(1)) {
      const [sourceAccount, id, reelUrl, platform, destinationAccount, status, updatedAt, note] = line.split("\t");
      if (!sourceAccount || !reelUrl || !platform || !destinationAccount) continue;
      this.data[this.key(sourceAccount, reelUrl, platform, destinationAccount)] = {
        sourceAccount, reelId: id || reelId(reelUrl), reelUrl, platform, destinationAccount,
        status: (status || "retry").toLowerCase(), updatedAt: updatedAt || "", note: note || ""
      };
    }
  }

  migrateJson(cwd) {
    const oldFile = path.join(cwd, "state", "transfers.json");
    if (!fs.existsSync(oldFile)) return;
    const old = JSON.parse(fs.readFileSync(oldFile, "utf8"));
    for (const [key, value] of Object.entries(old)) {
      const [sourceAccount, reelUrl, platform, destinationAccount] = key.split("|");
      if (!destinationAccount) continue;
      this.data[key] = {
        sourceAccount, reelId: reelId(reelUrl), reelUrl, platform, destinationAccount,
        status: value.status || (value.completedAt ? "completed" : "retry"),
        updatedAt: value.completedAt || value.updatedAt || value.startedAt || "",
        note: value.error || "Migrated from transfers.json"
      };
    }
  }

  record(sourceAccount, reelUrl, platform, destinationAccount) {
    return this.data[this.key(sourceAccount, reelUrl, platform, destinationAccount)];
  }

  has(...args) { return this.record(...args)?.status === "completed"; }
  status(...args) { return this.record(...args)?.status || null; }
  isClaimed(...args) { return this.has(...args); }

  set(sourceAccount, reelUrl, platform, destinationAccount, status, note = "") {
    const key = this.key(sourceAccount, reelUrl, platform, destinationAccount);
    this.data[key] = {
      sourceAccount, reelId: reelId(reelUrl), reelUrl, platform, destinationAccount,
      status, updatedAt: new Date().toISOString(), note
    };
    this.save();
  }

  begin(sourceAccount, reelUrl, platform, destinationAccount) {
    this.set(sourceAccount, reelUrl, platform, destinationAccount, "started", "Upload attempt started");
  }

  complete(sourceAccount, reelUrl, platform, destinationAccount) {
    this.set(sourceAccount, reelUrl, platform, destinationAccount, "completed", "Platform publication confirmed");
  }

  needsReview(sourceAccount, reelUrl, platform, destinationAccount, error) {
    this.set(sourceAccount, reelUrl, platform, destinationAccount, "needs_review", String(error?.message || error));
  }

  unavailable(sourceAccount, reelUrl, platform, destinationAccount, error) {
    this.set(sourceAccount, reelUrl, platform, destinationAccount, "unavailable", String(error?.message || error));
  }

  save() {
    const rows = Object.values(this.data)
      .sort((a, b) => `${a.reelId}|${a.platform}|${a.destinationAccount}`.localeCompare(`${b.reelId}|${b.platform}|${b.destinationAccount}`))
      .map((item) => [item.sourceAccount, item.reelId, item.reelUrl, item.platform, item.destinationAccount, item.status, item.updatedAt, item.note].map(clean).join("\t"));
    fs.writeFileSync(this.filename, [HEADERS.join("\t"), ...rows].join("\r\n") + "\r\n");
  }
}
