const REQUIRED_TIKTOK_SESSION_COOKIES = ["sessionid", "tt-target-idc"];

export function selectTikTokSessionCookies(cookies) {
  const available = new Map(
    (Array.isArray(cookies) ? cookies : [])
      .filter((cookie) =>
        REQUIRED_TIKTOK_SESSION_COOKIES.includes(cookie?.name) &&
        typeof cookie?.value === "string" && cookie.value.length > 0 &&
        /(^|\.)tiktok\.com$/i.test(String(cookie.domain || ""))
      )
      .map((cookie) => [cookie.name, cookie])
  );
  const missing = REQUIRED_TIKTOK_SESSION_COOKIES.filter((name) => !available.has(name));
  if (missing.length) return { ready: false, missing };

  return {
    ready: true,
    cookies: REQUIRED_TIKTOK_SESSION_COOKIES.map((name) => {
      const cookie = available.get(name);
      return {
        name,
        value: cookie.value,
        domain: cookie.domain || ".tiktok.com",
        path: cookie.path || "/",
        secure: Boolean(cookie.secure),
        httpOnly: Boolean(cookie.httpOnly)
      };
    })
  };
}
