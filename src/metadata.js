const YOUTUBE_TITLE_MAX = 100;

export function normalizeCaption(value = "") {
  return value.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
}

export function firstMeaningfulLine(caption) {
  return normalizeCaption(caption).split("\n").find((line) => line.trim())?.trim() || "Instagram Reel";
}

export function truncateUnicode(text, maximum) {
  const chars = [...text];
  if (chars.length <= maximum) return text;
  return chars.slice(0, Math.max(0, maximum - 1)).join("").trimEnd() + "…";
}

export function extractHashtags(caption) {
  return [...new Set(normalizeCaption(caption).match(/#[\p{L}\p{N}_]+/gu) ?? [])];
}

export function mapMetadata({ caption, reelUrl }) {
  const exactCaption = normalizeCaption(caption);
  const titleCaption = (exactCaption || "Instagram Reel").replace(/\s+/g, " ").trim();
  const title = truncateUnicode(titleCaption, YOUTUBE_TITLE_MAX);
  return {
    source: { url: reelUrl, caption: exactCaption },
    tiktok: { caption: exactCaption },
    youtube: {
      title,
      description: exactCaption,
      tags: extractHashtags(exactCaption).map((tag) => tag.slice(1))
    }
  };
}
