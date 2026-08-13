const profileInput = document.querySelector("#chrome-profile");
const saved = await chrome.storage.local.get("chromeProfile");
profileInput.value = saved.chromeProfile || "";

document.querySelector("#connect").addEventListener("click", async () => {
  const status = document.querySelector("#status");
  const chromeProfile = profileInput.value.trim();
  if (!chromeProfile) {
    status.textContent = "Enter the profile alias configured in config.json.";
    profileInput.focus();
    return;
  }

  await chrome.storage.local.set({ chromeProfile });
  status.textContent = "Checking...";
  try {
    const response = await fetch("http://127.0.0.1:43117/health");
    if (!response.ok) throw new Error();
    const health = await response.json();
    if (health.chromeProfile && health.chromeProfile !== chromeProfile) {
      status.textContent = `The harness is targeting '${health.chromeProfile}', not '${chromeProfile}'. Change --chrome-profile or open the matching Chrome profile.`;
      return;
    }
    await chrome.runtime.sendMessage({ type: "poll" });
    status.textContent = `Connected as '${chromeProfile}'. Matching jobs will open in this profile.`;
  } catch {
    status.textContent = "Profile alias saved. The local harness is not running.";
  }
});
