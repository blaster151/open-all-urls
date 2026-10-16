chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !message || message.target !== 'offscreen') return;
  if (message.action !== 'read-clipboard' && message.action !== 'write-clipboard') return;

  try {
    if (message.action === 'read-clipboard') {
      sendResponse({ success: true, text: readClipboard() });
    } else {
      if (typeof message.text !== 'string') throw new Error('Expected text');
      writeClipboard(message.text);
      sendResponse({ success: true });
    }
  } catch {
    // Never send clipboard contents or raw DOM exceptions back as error details.
    sendResponse({ success: false });
  }
});

function readClipboard() {
  const textarea = document.createElement('textarea');
  document.body.appendChild(textarea);
  try {
    textarea.focus();
    if (!document.execCommand('paste')) throw new Error('Paste failed');
    return textarea.value;
  } finally {
    textarea.remove();
  }
}

function writeClipboard(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  // An empty textarea has no selected range. Supply clipboard data explicitly so
  // copying a window with no HTTP(S) tabs also replaces the previous clipboard.
  let copied = false;
  const onCopy = event => {
    if (!event.clipboardData) return;
    event.clipboardData.setData('text/plain', text);
    event.preventDefault();
    copied = true;
  };
  document.body.appendChild(textarea);
  document.addEventListener('copy', onCopy);
  try {
    textarea.focus();
    textarea.select();
    if (!document.execCommand('copy') || !copied) throw new Error('Copy failed');
  } finally {
    document.removeEventListener('copy', onCopy);
    textarea.remove();
  }
}
