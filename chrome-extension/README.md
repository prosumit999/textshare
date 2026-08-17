# TextShare Chrome extension

The extension provides two ways to begin a share:

1. Select text on any webpage, right-click, and choose **Share selection with TextShare**.
2. Open the extension popup, paste text or code, and choose **Continue in TextShare**.

The selected content is passed in a URL fragment. Fragments are not sent in HTTP requests or server access logs. TextShare removes the fragment from the address bar immediately after importing it.

## Load locally

1. Start TextShare at `http://localhost:4321`.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select this `chrome-extension` folder.
5. Select text on a webpage and use the right-click menu.

Use the settings button in the popup to replace localhost with the production TextShare origin before publishing.
