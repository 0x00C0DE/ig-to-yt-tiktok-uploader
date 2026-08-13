function displayHandle(account, accountId) {
  const value = account?.handle || account?.label || accountId;
  return String(value).startsWith("@") ? String(value) : `@${value}`;
}
export class UploadManager {
  constructor({ state, resolveAccount, uploaders, logger = console, onPrepared = null }) {
    this.state = state;
    this.resolveAccount = resolveAccount;
    this.uploaders = uploaders;
    this.logger = logger;
    this.onPrepared = onPrepared;
  }

  async upload({ sourceAccount, reelUrl, videoPath, metadata, mode, destinations }) {
    const entries = await Promise.all(destinations.map(async ([platform, accountId]) => {
      if (this.state.has(sourceAccount, reelUrl, platform, accountId)) {
        return [platform, { platform, accountId, status: "skipped", message: "Verified upload already completed" }];
      }

      let account;
      try {
        account = this.resolveAccount(platform, accountId);
        const handle = displayHandle(account, accountId);
        const uploader = this.uploaders[platform];
        if (!uploader) throw new Error(`No uploader is configured for ${platform}`);
        this.state.begin(sourceAccount, reelUrl, platform, accountId);
        this.logger.log?.(`[${platform}][${handle}] Starting upload...`);
        const result = await uploader({
          platform, accountId, account, videoPath,
          metadata: metadata[platform], mode, sourceAccount, reelUrl
        });
        if (!result || !["completed", "prepared"].includes(result.status)) {
          throw new Error(result?.message || `${platform} did not return a successful upload status`);
        }
        if (result.status === "prepared" && this.onPrepared) {
          await this.onPrepared({ platform, accountId, account, result });
        }
        if (result.status === "completed" || this.onPrepared) {
          this.state.complete(sourceAccount, reelUrl, platform, accountId, {
            videoPath, uploadMethod: result.uploadMethod, publishId: result.publishId
          });
        }
        this.logger.log?.(`[${platform}][${handle}] ${result.message || "Upload successful"}`);
        return [platform, { platform, accountId, ...result }];
      } catch (error) {
        this.state.needsReview(sourceAccount, reelUrl, platform, accountId, error);
        const handle = displayHandle(account, accountId);
        this.logger.error?.(`[${platform}][${handle}] ${error.message}`);
        return [platform, { platform, accountId, status: "failed", message: error.message, error }];
      }
    }));
    return Object.fromEntries(entries);
  }
}
