import fs from "node:fs";

const API = "https://open.tiktokapis.com/v2";
const TEN_MIB = 10 * 1024 * 1024;

function apiError(payload, fallback) {
  const error = payload?.error;
  if (!error || error.code === "ok") return null;
  return new Error(`TikTok API ${error.code}: ${error.message || fallback}`);
}

async function apiPost(pathname, accessToken, body) {
  const response = await fetch(`${API}${pathname}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8"
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`TikTok API request failed (${response.status}): ${payload?.error?.message || response.statusText}`);
  const error = apiError(payload, "request rejected");
  if (error) throw error;
  return payload.data || {};
}

export function chunkPlan(videoSize) {
  if (!(videoSize > 0)) throw new Error("TikTok cannot upload an empty video");
  if (videoSize < 2 * TEN_MIB) return { chunkSize: videoSize, totalChunkCount: 1 };
  return {
    chunkSize: TEN_MIB,
    totalChunkCount: Math.max(1, Math.floor(videoSize / TEN_MIB))
  };
}

async function uploadChunks(uploadUrl, videoPath, videoSize, plan) {
  const handle = await fs.promises.open(videoPath, "r");
  try {
    let start = 0;
    for (let index = 0; index < plan.totalChunkCount; index++) {
      const isFinal = index === plan.totalChunkCount - 1;
      const length = isFinal ? videoSize - start : plan.chunkSize;
      const buffer = Buffer.allocUnsafe(length);
      const { bytesRead } = await handle.read(buffer, 0, length, start);
      if (bytesRead !== length) throw new Error(`Could not read TikTok upload chunk ${index + 1}`);
      const end = start + length - 1;
      const response = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": String(length),
          "Content-Range": `bytes ${start}-${end}/${videoSize}`
        },
        body: buffer
      });
      if (!response.ok) throw new Error(`TikTok media upload failed on chunk ${index + 1} (${response.status})`);
      start = end + 1;
    }
  } finally {
    await handle.close();
  }
}

async function waitForPublish(accessToken, publishId, timeout = 10 * 60_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const data = await apiPost("/post/publish/status/fetch/", accessToken, { publish_id: publishId });
    if (data.status === "PUBLISH_COMPLETE") return data;
    if (data.status === "FAILED") throw new Error(`TikTok publishing failed: ${data.fail_reason || "unknown reason"}`);
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error("TikTok did not confirm publication within ten minutes");
}

export async function uploadTikTokApi({ videoPath, metadata, account, mode }) {
  if (mode !== "publish") throw new Error("TikTok API mode currently supports --mode publish only");
  const variable = account.accessTokenEnv || "TIKTOK_ACCESS_TOKEN";
  const accessToken = process.env[variable];
  if (!accessToken) {
    throw new Error(`TikTok API token missing. Set the ${variable} environment variable to a user access token with video.publish scope.`);
  }

  const creator = await apiPost("/post/publish/creator_info/query/", accessToken, {});
  const privacyLevel = account.privacyLevel || "SELF_ONLY";
  const allowed = creator.privacy_level_options || [];
  if (!allowed.includes(privacyLevel)) {
    throw new Error(`TikTok privacy level ${privacyLevel} is unavailable for this account. Allowed: ${allowed.join(", ") || "none"}`);
  }

  const videoSize = (await fs.promises.stat(videoPath)).size;
  const plan = chunkPlan(videoSize);
  const initialized = await apiPost("/post/publish/video/init/", accessToken, {
    post_info: {
      title: metadata.caption,
      privacy_level: privacyLevel,
      disable_duet: Boolean(account.disableDuet),
      disable_comment: Boolean(account.disableComment),
      disable_stitch: Boolean(account.disableStitch)
    },
    source_info: {
      source: "FILE_UPLOAD",
      video_size: videoSize,
      chunk_size: plan.chunkSize,
      total_chunk_count: plan.totalChunkCount
    }
  });
  if (!initialized.publish_id || !initialized.upload_url) throw new Error("TikTok API did not return a publish ID and upload URL");
  await uploadChunks(initialized.upload_url, videoPath, videoSize, plan);
  const result = await waitForPublish(accessToken, initialized.publish_id);
  return { status: "completed", message: "TikTok API publication confirmed", publishId: initialized.publish_id, result };
}
