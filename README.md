# Open All URLs

A small Chrome Manifest V3 extension that opens URLs from your clipboard and copies web-tab URLs to your clipboard. Requires **Chrome 116 or newer**.

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| **Alt+V** | Open HTTP(S) URLs from the clipboard in background tabs |
| **Alt+C** | Copy HTTP(S) tab URLs from the focused window, one per line |

Shortcuts can be reassigned at `chrome://extensions/shortcuts` if Chrome or your operating system reserves a key combination.

## Behavior and safety limits

- Put one complete `http://` or `https://` URL on each line. Surrounding whitespace and blank lines are ignored. Unsupported schemes, prose and malformed URLs are skipped. Use percent-encoding for spaces inside a URL.
- Valid URLs retain their input order and duplicates. Tabs open one at a time in the background in the starting window, even if you switch windows; the extension does not wait for each page to finish loading.
- **At most 50 valid URLs may be opened per shortcut.** If there are more, the entire operation is rejected before opening any tabs. Split the input into smaller batches. There is no silent truncation.
- Clipboard input is limited to **1,048,576 UTF-16 code units** (JavaScript string length, roughly one million ordinary characters). Oversized input is rejected before parsing or opening tabs. The same text limit applies to copying tab URLs, but copying is not limited to 50 tabs.
- Only one command runs at a time. Extra shortcuts while a command is in progress are rejected, not queued. Press the shortcut again after it finishes if needed.
- Copy uses the last-focused Chrome window, excludes non-HTTP(S) tabs, and preserves tab order. If that window has no web URLs, it explicitly writes empty text to replace the previous clipboard.
- If Chrome fails partway through opening tabs, the operation stops and reports how many opened. Check those tabs before retrying to avoid duplicates.

### Errors and retrying

Pin **Open All URLs** in Chrome's extensions menu to see its `!` error badge. Hover over the icon for the explanation. The next successful command clears the error. No popups or additional permissions are used. If a clipboard operation fails, try the shortcut again; failed offscreen-document setup no longer prevents a later retry.

## Local installation

1. Open `chrome://extensions` in a test Chrome profile.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this folder.
4. Confirm the shortcuts at `chrome://extensions/shortcuts` and pin the icon for error visibility.

This repository is release preparation, not evidence of a published Chrome Web Store listing. See [the release checklist](RELEASE_CHECKLIST.md) before distribution.

## Privacy and permissions

The extension does not include analytics, a backend, data storage, content scripts or host permissions. Clipboard text and tab URLs are processed locally when a shortcut is invoked. Temporary clipboard textareas are removed after success or failure. Raw clipboard contents, URLs and browser exceptions are not logged. Opening a URL navigates Chrome to that site, which makes the normal browser network requests to its destination; this is not a promise that opened pages are safe.

Existing permissions and their purpose:

- `tabs`: read tab URLs for copying from the focused window
- `clipboardRead`: read clipboard text when opening URLs
- `clipboardWrite`: copy tab URLs to the clipboard
- `offscreen`: perform clipboard operations in a hidden extension document, since service workers do not have a DOM

Clipboard access retains Chrome's `document.execCommand` approach used by the original extension. Its success result is checked, copy data is supplied explicitly (including empty text), and errors are returned to the service worker. This deprecated browser API needs continued acceptance testing; switching to a different clipboard architecture is outside this hardening slice.

## Development and packaging

Requirements: Node.js 22+ (tested with 24), npm and Python 3. No dependencies or install step are needed.

```sh
npm run check     # syntax, manifest/permission invariants, focused automated tests
npm run package   # checks, then a reproducible dist/open-all-urls-1.0.zip
```

The ZIP contains only `manifest.json`, `background.js`, `offscreen.html` and `offscreen.js`, with fixed order and metadata. It excludes tests, developer scripts, Git files and documentation. Running packaging twice with unchanged runtime files produces identical bytes. Packaging does not upload or publish anything. The manifest version remains `1.0`; choose the next release version after confirming any existing distribution history.

The automated tests use synthetic fixtures and mocked Chrome/DOM APIs. They cover parsing, input boundaries, focused-window selection, order/duplicates, single-flight offscreen setup, concurrent commands, failure cleanup, retries, partial tab failures and status reporting. They do not substitute for native shortcut/clipboard acceptance testing.

## Design references

- [Offscreen lifecycle and Chrome 116 context lookup](https://developer.chrome.com/docs/extensions/reference/api/offscreen)
- [Tabs API and last-focused-window queries](https://developer.chrome.com/docs/extensions/reference/api/tabs)
- [Action badge and tooltip API](https://developer.chrome.com/docs/extensions/reference/api/action)
