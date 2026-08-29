const SITE_URL = "https://textshare.pro/";
const textInput = document.querySelector("#share-text");
const count = document.querySelector("#character-count");
const form = document.querySelector("#share-form");
const homeLink = document.querySelector("#home-link");

textInput.addEventListener("input", () => {
  count.textContent = `${textInput.value.length.toLocaleString()} / 50,000`;
});

homeLink.addEventListener("click", (event) => {
  event.preventDefault();
  chrome.tabs.create({ url: SITE_URL });
  window.close();
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = textInput.value.trim();
  if (!text) return textInput.focus();
  chrome.tabs.create({ url: `${SITE_URL}/#t=${encodeURIComponent(text)}` });
  window.close();
});
