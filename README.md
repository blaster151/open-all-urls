# Open All URLs

A Chrome Manifest V3 extension that opens URLs from your clipboard and copies tab URLs to your clipboard.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| **Alt+V** | Open all URLs from clipboard in new tabs |
| **Alt+C** | Copy all open tab URLs to clipboard (newline-delimited) |

## How It Works

- **Alt+V**: Reads your clipboard, extracts all `http://` and `https://` URLs (one per line), and opens each in a new background tab.
- **Alt+C**: Collects the URLs of every tab in the focused window and copies them to the clipboard, one URL per line.

## Installation

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked** and select this folder
4. The extension is now active — no icon needed, just use the shortcuts

## Customizing Shortcuts

1. Go to `chrome://extensions/shortcuts`
2. Find **Open All URLs** in the list
3. Click the pencil icon next to either command to reassign the shortcut
