const DEFAULT_SITE_URL = "http://textshare.pro/";
const MENU_ID = "textshare-selected-text";

function normalizeSiteUrl(value) {
  try {
    const url = new URL(value || DEFAULT_SITE_URL);
    if (!["http:", "https:"].includes(url.protocol)) return DEFAULT_SITE_URL;
    return url.origin;
  } catch {
    return DEFAULT_SITE_URL;
  }
}

async function createMenu() {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Share selection with TextShare",
    contexts: ["selection"],
  });
}

chrome.runtime.onInstalled.addListener(createMenu);
chrome.runtime.onStartup.addListener(createMenu);

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== MENU_ID || !info.selectionText?.trim()) return;
  const settings = await chrome.storage.sync.get({ siteUrl: DEFAULT_SITE_URL });
  const siteUrl = normalizeSiteUrl(settings.siteUrl);
  const shareUrl = `${siteUrl}/#share=${encodeURIComponent(info.selectionText)}`;
  await chrome.tabs.create({ url: shareUrl });
});
