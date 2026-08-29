# Text Share Chrome extension

The extension provides two ways to begin a share:

1. Select text on any webpage, right-click, and choose **Share selection with Text Share**.
2. Open the extension popup, paste text or code, and choose **Continue in Text Share**.

The selected content is passed in a URL fragment. Fragments are not sent in HTTP requests or server access logs. Text Share removes the fragment from the address bar immediately after importing it.

The extension always shares to the production origin, `https://textshare.pro/`.

## Load locally

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this `chrome-extension` folder.
4. Select text on a webpage and use the right-click menu.
