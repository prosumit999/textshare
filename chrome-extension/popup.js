const DEFAULT_SITE_URL = "http://localhost:4321";
const textInput = document.querySelector("#share-text");
const count = document.querySelector("#character-count");
const form = document.querySelector("#share-form");
const settingsToggle = document.querySelector("#settings-toggle");
const settingsPanel = document.querySelector("#settings-panel");
const siteUrlInput = document.querySelector("#site-url");
const saveSettings = document.querySelector("#save-settings");
const settingsStatus = document.querySelector("#settings-status");
const homeLink = document.querySelector("#home-link");

function normalizeSiteUrl(value) {
  try {
    const url = new URL(value || DEFAULT_SITE_URL);
    if (!["http:", "https:"].includes(url.protocol))
      throw new Error("Unsupported protocol");
    return url.origin;
  } catch {
    return null;
  }
}

async function getSiteUrl() {
  const settings = await chrome.storage.sync.get({ siteUrl: DEFAULT_SITE_URL });
  return normalizeSiteUrl(settings.siteUrl) || DEFAULT_SITE_URL;
}

async function initialize() {
  const siteUrl = await getSiteUrl();
  siteUrlInput.value = siteUrl;
  homeLink.addEventListener("click", async (event) => {
    event.preventDefault();
    await chrome.tabs.create({ url: await getSiteUrl() });
    window.close();
  });
}

textInput.addEventListener("input", () => {
  count.textContent = `${textInput.value.length.toLocaleString()} / 50,000`;
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = textInput.value.trim();
  if (!text) return textInput.focus();
  const siteUrl = await getSiteUrl();
  await chrome.tabs.create({
    url: `${siteUrl}/#share=${encodeURIComponent(text)}`,
  });
  window.close();
});

settingsToggle.addEventListener("click", () => {
  const isOpening = settingsPanel.hidden;
  settingsPanel.hidden = !isOpening;
  settingsToggle.setAttribute("aria-expanded", String(isOpening));
  if (isOpening) siteUrlInput.focus();
});

saveSettings.addEventListener("click", async () => {
  const siteUrl = normalizeSiteUrl(siteUrlInput.value);
  if (!siteUrl) {
    settingsStatus.textContent = "Enter a valid HTTP or HTTPS address.";
    siteUrlInput.focus();
    return;
  }
  await chrome.storage.sync.set({ siteUrl });
  siteUrlInput.value = siteUrl;
  settingsStatus.textContent = "Site address saved.";
});

initialize();
