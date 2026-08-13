const SUPPORTED = new Set(["tiktok", "youtube"]);

export function selectedPlatforms(value, defaults = ["tiktok", "youtube"]) {
  const items = value
    ? String(value).split(",").map((item) => item.trim().toLowerCase()).filter(Boolean)
    : defaults;
  const unique = [...new Set(items)];
  const invalid = unique.filter((platform) => !SUPPORTED.has(platform));
  if (invalid.length) throw new Error(`Unsupported platform(s): ${invalid.join(", ")}. Use tiktok, youtube, or tiktok,youtube.`);
  if (!unique.length) throw new Error("At least one platform must be enabled");
  return unique;
}

export function selectDestinations(options, defaults) {
  const enabled = new Set(selectedPlatforms(options.platforms, defaults));
  return [["tiktok", options.tiktok], ["youtube", options.youtube]]
    .filter(([platform, accountId]) => enabled.has(platform) && accountId);
}
