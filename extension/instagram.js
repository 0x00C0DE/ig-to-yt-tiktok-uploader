(async () => {
  const bridge = globalThis.ReelBridge;
  const id = await bridge.jobId();
  if (!id) return;

  const canonical = (value) => {
    const match = String(value).match(/instagram\.com\/(?:[a-zA-Z0-9._]+\/)?reel\/([^/?#]+)/i);
    return match ? `https://www.instagram.com/reel/${match[1]}/` : null;
  };

  try {
    const job = await bridge.job(id);
    const maximum = job.metadata.maxReels || Infinity;
    const found = new Set();
    let stagnant = 0;

    while (found.size < maximum && stagnant < 25) {
      const before = found.size;
      for (const link of document.querySelectorAll('a[href*="/reel/"]')) {
        const url = canonical(link.href);
        if (url) found.add(url);
        if (found.size >= maximum) break;
      }
      stagnant = found.size === before ? stagnant + 1 : 0;
      const links = [...document.querySelectorAll('a[href*="/reel/"]')];
      links.at(-1)?.scrollIntoView({ block: "end" });
      window.scrollBy(0, Math.max(window.innerHeight * 0.85, 600));
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    if (!found.size) throw new Error("No Reels were visible in the current Instagram Chrome session");
    const reels = [...found].slice(0, maximum);
    await bridge.report(
      id,
      "completed",
      `Discovered ${reels.length} Reel(s) in the current Chrome session`,
      { reels }
    );
  } catch (error) {
    await bridge.report(id, "failed", error.message).catch(() => {});
  }
})();
