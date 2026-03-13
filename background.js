let creatingOffscreen;

async function setupOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });

  if (existingContexts.length > 0) return;

  if (creatingOffscreen) {
    await creatingOffscreen;
  } else {
    creatingOffscreen = chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['CLIPBOARD'],
      justification: 'Read/write clipboard for URL operations'
    });
    await creatingOffscreen;
    creatingOffscreen = null;
  }
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'open-urls') {
    await openUrlsFromClipboard();
  } else if (command === 'copy-urls') {
    await copyUrlsToClipboard();
  }
});

async function openUrlsFromClipboard() {
  await setupOffscreenDocument();

  const response = await chrome.runtime.sendMessage({
    target: 'offscreen',
    action: 'read-clipboard'
  });

  if (!response || !response.text) return;

  const urls = response.text
    .split(/[\r\n]+/)
    .map(line => line.trim())
    .filter(line => /^https?:\/\//i.test(line));

  for (const url of urls) {
    chrome.tabs.create({ url, active: false });
  }
}

async function copyUrlsToClipboard() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const urls = tabs
    .map(tab => tab.url)
    .filter(url => url && /^https?:\/\//i.test(url))
    .join('\n');

  await setupOffscreenDocument();

  await chrome.runtime.sendMessage({
    target: 'offscreen',
    action: 'write-clipboard',
    text: urls
  });
}
