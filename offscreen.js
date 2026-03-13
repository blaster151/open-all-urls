chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') return;

  if (message.action === 'read-clipboard') {
    readClipboard().then(text => sendResponse({ text }));
    return true;
  } else if (message.action === 'write-clipboard') {
    writeClipboard(message.text).then(() => sendResponse({ success: true }));
    return true;
  }
});

async function readClipboard() {
  const textarea = document.createElement('textarea');
  document.body.appendChild(textarea);
  textarea.focus();
  document.execCommand('paste');
  const text = textarea.value;
  textarea.remove();
  return text;
}

async function writeClipboard(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}
