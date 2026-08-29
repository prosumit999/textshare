const SITE_URL = "https://textshare.pro/";
const MENU_ID = "textshare-selected-text";

function createMenu() {
  chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Share selection with Text Share",
    contexts: ["selection"],
  });
}

chrome.runtime.onInstalled.addListener(createMenu);
chrome.runtime.onStartup.addListener(createMenu);

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== MENU_ID || !info.selectionText?.trim()) return;
  const shareUrl = `${SITE_URL}/#t=${encodeURIComponent(info.selectionText)}`;
  await chrome.tabs.create({ url: shareUrl });
});
