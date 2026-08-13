import { ExtensionBridge } from "./extension-bridge.js";
import { saveTikTokAutoUploaderSession } from "./uploaders/tiktok-auto-uploader.js";

export async function setupTikTokAutoUploaderInChrome({
  cwd,
  account,
  chromeProfile,
  createBridge = (options) => new ExtensionBridge(options),
  saveSession = saveTikTokAutoUploaderSession
}) {
  if (!chromeProfile?.id) {
    throw new Error(
      "TikTok setup in existing Chrome requires a logical Chrome profile alias. " +
      "Configure defaults.chromeProfile and chromeProfiles, or pass --chrome-profile <alias>."
    );
  }

  const bridge = createBridge({ chromeProfile: chromeProfile.id });
  let job;
  await bridge.start();
  try {
    job = bridge.enqueueTikTokSession({
      accountHandle: account.handle || account.label || account.id
    });
    const completed = await bridge.wait(job, Number(account.loginTimeoutMs) || 20 * 60_000);
    const result = await saveSession({ cwd, account, cookies: completed.result?.cookies });
    completed.result = null;
    return result;
  } finally {
    if (job) job.result = null;
    await bridge.stop();
  }
}
