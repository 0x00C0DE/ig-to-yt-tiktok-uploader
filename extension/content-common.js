globalThis.ReelBridge = {
  base: "http://127.0.0.1:43117",
  async jobId() {
    const queryId = new URL(location.href).searchParams.get("reel_bridge_job");
    if (queryId) return queryId;
    for (let attempt = 0; attempt < 20; attempt++) {
      const result = await chrome.runtime.sendMessage({ type: "getJobId" }).catch(() => null);
      if (result?.id) return result.id;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return null;
  },
  async job(id) {
    const response = await fetch(`${this.base}/api/jobs/${encodeURIComponent(id)}`);
    if (!response.ok) throw new Error(`Job lookup failed (${response.status})`);
    return response.json();
  },
  async report(id, status, message = "", result = null) {
    await fetch(`${this.base}/api/jobs/${encodeURIComponent(id)}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, message, result })
    });
  },
  async setLocalFile(jobId) {
    const result = await chrome.runtime.sendMessage({ type: "setFileInput", jobId });
    if (!result?.ok) throw new Error(result?.error || "Chrome could not assign the local video file");
  },
  async visible(selectors, timeout = 60000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      for (const selector of selectors) {
        const node = document.querySelector(selector);
        if (node && node.getClientRects().length) return node;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`Timed out waiting for ${selectors.join(", ")}`);
  },
  async element(selectors, timeout = 60000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      for (const selector of selectors) {
        const node = document.querySelector(selector);
        if (node) return node;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`Timed out waiting for ${selectors.join(", ")}`);
  },
  async button(textPattern, timeout = 120000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const node = [...document.querySelectorAll("button")].find((button) =>
        textPattern.test((button.textContent || "").trim()) &&
        button.getClientRects().length && !button.disabled &&
        button.getAttribute("aria-disabled") !== "true"
      );
      if (node) return node;
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
    throw new Error(`Timed out waiting for enabled button ${textPattern}`);
  },
  async bodyText(textPattern, timeout = 180000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (textPattern.test(document.body?.innerText || "")) return;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error(`Timed out waiting for page status ${textPattern}`);
  },
  async elementByText(selectors, textPattern, timeout = 60000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      for (const selector of selectors) {
        const node = [...document.querySelectorAll(selector)].find((item) =>
          textPattern.test((item.textContent || "").trim()) && item.getClientRects().length
        );
        if (node) return node;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`Timed out waiting for element text ${textPattern}`);
  },
  fill(node, value) {
    node.focus();
    if (node.isContentEditable) {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(node);
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand("insertText", false, value);
      selection.removeAllRanges();
      node.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    } else {
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), "value")?.set;
      setter?.call(node, value);
      node.dispatchEvent(new Event("input", { bubbles: true }));
      node.dispatchEvent(new Event("change", { bubbles: true }));
    }
    node.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
  },
  async ensureFilled(node, value, attempts = 5) {
    const normalized = (text) => String(text || "").replace(/\r\n/g, "\n").trim();
    for (let attempt = 0; attempt < attempts; attempt++) {
      this.fill(node, value);
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const actual = node.isContentEditable ? node.innerText : node.value;
      if (normalized(actual) === normalized(value)) return;
    }
    const actual = node.isContentEditable ? node.innerText : node.value;
    throw new Error(`Field verification failed. Expected '${value.slice(0, 40)}', found '${String(actual).slice(0, 40)}'.`);
  }
};
