document.querySelector("#connect").addEventListener("click", async () => {
  const status = document.querySelector("#status");
  status.textContent = "Checking…";
  try {
    const response = await fetch("http://127.0.0.1:43117/health");
    if (!response.ok) throw new Error();
    await chrome.runtime.sendMessage({ type: "poll" });
    status.textContent = "Connected. Upload jobs will open in new tabs.";
  } catch { status.textContent = "Local harness is not running."; }
});
