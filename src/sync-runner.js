function failureLabel(failure) {
  const destination = [failure.platform, failure.accountId].filter(Boolean).join("/") || "destination";
  return `${destination}: ${failure.message || "upload failed"}`;
}

export async function processReelSequence({
  reels,
  processReel,
  isUnavailable,
  markUnavailable = async () => {},
  logger = console
}) {
  const summary = { completed: 0, skipped: 0, failed: 0, inaccessible: 0 };
  for (const [index, reelUrl] of reels.entries()) {
    logger.log?.(`\n[${index + 1}/${reels.length}] ${reelUrl}`);
    try {
      const result = await processReel(reelUrl, index);
      if (result.skipped) {
        summary.skipped++;
        continue;
      }
      const failures = Array.isArray(result.failures) ? result.failures : [];
      if (failures.length) {
        summary.failed++;
        logger.warn?.(`Reel has incomplete destination upload(s) (${failures.map(failureLabel).join(" | ")}); continuing to the next Reel.`);
        continue;
      }
      summary.completed++;
    } catch (error) {
      if (!isUnavailable(error)) throw error;
      await markUnavailable(reelUrl, error);
      summary.inaccessible++;
      logger.warn?.(`Skipping inaccessible Reel and continuing: ${error.message}`);
    }
  }
  return summary;
}
