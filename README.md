# xsukax X Post to PDF (Microsoft Edge extension)

A separate Microsoft Edge / Chromium Manifest V3 extension for saving an individual X (Twitter) post to PDF. The extension operates locally and has no dependency on commercial APIs, CDN JavaScript packages or API keys.

## Output

Version 1.1 removes the time-zone editing field and suppresses all time-zone labels in the preview and both PDF export methods; it retains the publication date and time.


- Account **display name** and **@username**.
- Blue verification mark **next to the display name** only when the author has a recognized verification badge (or when the user manually marks the account verified). Otherwise no verification badge is rendered.
- Original post text, preserving line breaks and Unicode (Arabic, Amharic, English and emojis) as available from the displayed X post.
- Original publication **date + time**, interpreted from an X `<time datetime="...">` ISO timestamp in the browser's time zone. The time zone is used internally for conversion but is not displayed in the editor, preview, or PDF. Relative timestamp fallback supports `Just now`, `2m`, `3h`, `Yesterday`, etc.; approximations are labeled.
- Author profile photo, if a valid `pbs.twimg.com/profile_images/...` image can be loaded. Fallback is an initial-letter avatar. Users can also enter an image URL or select an image file locally.
- Clickable **original post URL at the bottom**, including on the final page of a long post.
- An X-like post-card layout, not a table of metadata. Engagement numbers are NOT invented.

## Install in Microsoft Edge

1. Unzip the archive and keep the `xsukax-x-post-pdf` folder intact.
2. Navigate to **edge://extensions**.
3. Turn on **Developer mode**.
4. Choose **Load unpacked** and select the `xsukax-x-post-pdf` folder.
5. Open an individual post in Edge at a URL like `https://x.com/ACCOUNT/status/POST_ID` (the legacy `twitter.com` domain also works).
6. Wait for the post to load, then click the extension icon and **Extract current X post**.
7. A preview tab opens. Inspect and edit **account name**, **@username**, **verification**, **publication date/time**, **post text**, **source URL** and **avatar** if necessary.
8. Choose **Download PDF** for a self-contained, image-rendered multilingual PDF with a clickable URL, or **Print / Save searchable PDF** to use Edge's native browser print-to-PDF (text remains selectable/searchable).

If `Download PDF` is blocked by Edge's download preferences, allow downloads from the extension or use Print. For Edge's Print action, set destination to **Save as PDF** and disable Edge's extra print headers/footers if desired.

## Privacy and security

- No X API keys, login secrets, or remote server.
- Permissions: `activeTab` (only the tab the user invokes the extension on), `scripting` (one-time live DOM extraction), `storage` (temporary `chrome.storage.session` for extraction-to-preview handoff). Narrow `pbs.twimg.com` host permission loads profile pictures only.
- No telemetry, analytics, content uploads, or persistent post-history database.
- The avatar fetch uses `credentials:'omit'` and verifies the image URL remains on X's CDN.
- HTML from posts is treated as **text** in the preview (never inserted as trusted HTML).

## Project files

`manifest.json`, `popup.html`, `popup.css`, `popup.js`, `extract.js`, `report.html`, `report.css`, `report.js`, `pdf-export.js`, and `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`. `tests/test_extension.py` holds offline Chromium tests (requires playwright, PyMuPDF and Pillow for testing only; these are NOT required by the extension).

## Supported cases and known limitations

- Handles X status pages and `twitter.com/.../status/...` links. It intentionally asks the user to open a single post rather than scraping the entire X timeline.
- Browser print-to-PDF preserves selectable Unicode text. The direct PDF download rasterizes pages to ensure fonts and right-to-left text are visually preserved; its text is not searchable.
- Long posts are paginated, with the clickable original source on the last page.
- Media-only tweets may have blank post text. The extension does not download attached tweet photos/videos (other than the author avatar).
- The supplied static HTML examples contain no rendered tweet data. Offline fixtures verify the extraction strategies; **live testing on an authenticated X session is still recommended**.

Copyright © xsukax. Independent extension, not affiliated with or endorsed by X Corp.
