const MAX_URLS_PER_COMMAND = 50;
const MAX_CLIPBOARD_LENGTH = 1024 * 1024;
const DEFAULT_TITLE = 'Open All URLs: Alt+V to open, Alt+C to copy';
let creatingOffscreen;
let commandRunning = false;
let commandFinishing = false;
let statusUpdate = Promise.resolve();

// Validate without silently repairing malformed URLs or changing their spelling.
function isHttpUrl(value) {
  if (typeof value !== 'string' || !/^https?:\/\/[^/]/i.test(value) || /[\s\\\u0000-\u001f\u007f]/u.test(value)) {
    return false;
  }
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function parseClipboardUrls(text) {
  if (typeof text !== 'string') throw new Error('Could not read clipboard text. Try again.');
  if (text.length > MAX_CLIPBOARD_LENGTH) {
    throw new Error('Clipboard text is too large. Use at most 1,048,576 characters; no tabs were opened.');
  }
  const urls = [];
  for (const line of text.split(/[\r\n]+/)) {
    const url = line.trim();
    if (!isHttpUrl(url)) continue;
    urls.push(url);
    if (urls.length > MAX_URLS_PER_COMMAND) {
      throw new Error(`More than ${MAX_URLS_PER_COMMAND} URLs. Split them into smaller batches; no tabs were opened.`);
    }
  }
  return urls;
}

async function setupOffscreenDocument() {
  // Share the entire lookup/create operation, including failures, then permit retry.
  if (!creatingOffscreen) {
    creatingOffscreen = (async () => {
      const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [chrome.runtime.getURL('offscreen.html')]
      });
      if (existingContexts.length === 0) {
        await chrome.offscreen.createDocument({
          url: 'offscreen.html',
          reasons: ['CLIPBOARD'],
          justification: 'Read/write clipboard for URL operations'
        });
      }
    })().finally(() => { creatingOffscreen = null; });
  }
  await creatingOffscreen;
}

async function clipboardRequest(action, text) {
  try {
    await setupOffscreenDocument();
    const response = await chrome.runtime.sendMessage({ target: 'offscreen', action, ...(text === undefined ? {} : { text }) });
    if (!response || response.success !== true || (action === 'read-clipboard' && typeof response.text !== 'string')) {
      throw new Error('Clipboard operation failed');
    }
    return response;
  } catch {
    // Browser errors can contain private data. Only expose a fixed, actionable message.
    throw new Error(`Could not ${action === 'read-clipboard' ? 'read' : 'write'} the clipboard. Try the shortcut again.`);
  }
}

async function openUrlsFromClipboard(tab) {
  // Bind the whole batch to its starting window even if focus changes mid-open.
  let windowId = tab?.windowId;
  if (!Number.isInteger(windowId) || windowId < 0) {
    try {
      windowId = (await chrome.windows.getLastFocused({ windowTypes: ['normal'] })).id;
      if (!Number.isInteger(windowId) || windowId < 0) throw new Error('No window');
    } catch {
      throw new Error('Could not find the focused window. No tabs were opened.');
    }
  }
  const response = await clipboardRequest('read-clipboard');
  const urls = parseClipboardUrls(response.text);
  if (urls.length === 0) throw new Error('No valid HTTP or HTTPS URLs found. Put one URL on each line.');
  let opened = 0;
  for (const url of urls) {
    try {
      await chrome.tabs.create({ url, active: false, windowId });
      opened += 1;
    } catch {
      throw new Error(`Opened ${opened} of ${urls.length} tabs before Chrome stopped the operation. Check open tabs before retrying.`);
    }
  }
}

async function copyUrlsToClipboard() {
  let tabs;
  try {
    tabs = await chrome.tabs.query({ lastFocusedWindow: true });
  } catch {
    throw new Error('Could not read tabs in the focused window. Try again.');
  }
  const urls = tabs.map(tab => tab.url).filter(isHttpUrl).join('\n');
  if (urls.length > MAX_CLIPBOARD_LENGTH) {
    throw new Error('Tab URLs are too large to copy. The clipboard was not changed.');
  }
  await clipboardRequest('write-clipboard', urls);
}

function showStatus(message = '') {
  // Serialize the two API calls so a delayed busy notice cannot overwrite a result.
  statusUpdate = statusUpdate.then(async () => {
    try {
      await chrome.action.setTitle({ title: message ? `Open All URLs: ${message}` : DEFAULT_TITLE });
      await chrome.action.setBadgeText({ text: message ? '!' : '' });
    } catch {
      // Reporting must not leave a rejected command promise or hold the command lock.
      console.warn('Open All URLs could not update its status indicator.');
    }
  });
  return statusUpdate;
}

async function handleCommand(command, tab) {
  if (command !== 'open-urls' && command !== 'copy-urls') return;
  if (commandRunning) {
    if (!commandFinishing) {
      await showStatus('A clipboard command is still running. This extra shortcut was not queued.');
    }
    return;
  }
  commandRunning = true;
  try {
    let message = '';
    try {
      if (command === 'open-urls') await openUrlsFromClipboard(tab);
      else await copyUrlsToClipboard();
    } catch (error) {
      message = error.message;
    }
    // Preserve the final result, especially the partial-open count and retry warning.
    commandFinishing = true;
    await showStatus(message);
  } finally {
    commandFinishing = false;
    commandRunning = false;
  }
}

chrome.commands.onCommand.addListener(handleCommand);
