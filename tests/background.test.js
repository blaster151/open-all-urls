const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readFileSync } = require('node:fs');
const source = readFileSync(require.resolve('../background.js'), 'utf8');

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function harness() {
  const calls = { creates: [], queries: [], messages: [], offscreen: [], titles: [], badges: [], contexts: [], windows: [] };
  let listener;
  const chrome = {
    runtime: {
      getURL: file => `chrome-extension://test/${file}`,
      getContexts: async options => { calls.contexts.push(options); return []; },
      sendMessage: async message => { calls.messages.push(message); return { success: true, text: 'https://example.test/a' }; }
    },
    windows: { getLastFocused: async options => { calls.windows.push(options); return { id: 7 }; } },
    offscreen: { createDocument: async options => { calls.offscreen.push(options); } },
    tabs: {
      create: async options => { calls.creates.push(options); return { id: calls.creates.length }; },
      query: async options => { calls.queries.push(options); return [{ url: 'https://example.test/' }]; }
    },
    action: {
      setTitle: async options => { calls.titles.push(options.title); },
      setBadgeText: async options => { calls.badges.push(options.text); }
    },
    commands: { onCommand: { addListener: fn => { listener = fn; } } }
  };
  const context = vm.createContext({ chrome, URL, console });
  vm.runInContext(source, context);
  return { calls, chrome, context, command: (command, tab) => listener(command, tab) };
}
const plain = value => JSON.parse(JSON.stringify(value));

test('parser preserves line order, spelling, duplicates and valid HTTP(S) URL varieties', () => {
  const { context } = harness();
  const urls = ['HTTPS://example.test/a?b=1#c', 'http://localhost:8000/a', 'https://[::1]/', 'https://例え.テスト/a', 'https://example.test/a%20b', 'https://example.test/a%20b'];
  assert.deepEqual(plain(context.parseClipboardUrls(` \n${urls.join('\r\n')}\r\n `)), urls);
});

test('parser skips unsupported schemes, malformed hosts/ports, repairs, prose and embedded whitespace', () => {
  const invalid = ['javascript:alert(1)', 'data:text/html,hi', 'file:///tmp/a', 'chrome://extensions', 'ftp://example.test', '//example.test', 'example.test', 'https://', 'http://bad host/', 'https://[bad]/', 'http://example.test:99999/', 'https:///example.test/', 'https://example.test\\foo', 'https://example.test/a b', 'https://example.\ttest/', 'https://example.test/\u0000', 'Read https://example.test'];
  const { context } = harness();
  assert.deepEqual(plain(context.parseClipboardUrls(invalid.join('\n'))), []);
  for (const value of [null, undefined, {}, 7]) assert.equal(context.isHttpUrl(value), false);
});

test('empty or invalid-only input yields no URLs; non-string input is rejected', () => {
  const { context } = harness();
  assert.deepEqual(plain(context.parseClipboardUrls(' \r\n ')), []);
  assert.throws(() => context.parseClipboardUrls(null), /Could not read/);
});

test('exactly 50 URLs are allowed; 51 are rejected without truncation', () => {
  const { context } = harness();
  const url = 'https://example.test/';
  assert.equal(context.parseClipboardUrls(Array(50).fill(url).join('\n')).length, 50);
  assert.throws(() => context.parseClipboardUrls(Array(51).fill(url).join('\n')), /More than 50.*no tabs were opened/);
});

test('input length boundary is checked before splitting or opening', () => {
  const { context } = harness();
  assert.deepEqual(plain(context.parseClipboardUrls(' '.repeat(1024 * 1024))), []);
  assert.throws(() => context.parseClipboardUrls(' '.repeat(1024 * 1024 + 1)), /too large.*no tabs were opened/);
});

test('concurrent offscreen setup shares lookup and creation', async () => {
  const h = harness();
  const gate = deferred();
  h.chrome.offscreen.createDocument = async options => { h.calls.offscreen.push(options); await gate.promise; };
  const first = h.context.setupOffscreenDocument();
  const second = h.context.setupOffscreenDocument();
  await new Promise(setImmediate);
  assert.equal(h.calls.contexts.length, 1);
  assert.equal(h.calls.offscreen.length, 1);
  gate.resolve();
  await Promise.all([first, second]);
  assert.deepEqual(plain(h.calls.contexts[0]), { contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: ['chrome-extension://test/offscreen.html'] });
});

test('existing matching offscreen document is reused', async () => {
  const h = harness();
  h.chrome.runtime.getContexts = async () => [{ documentUrl: 'chrome-extension://test/offscreen.html' }];
  await h.context.setupOffscreenDocument();
  assert.equal(h.calls.offscreen.length, 0);
});

for (const failingStep of ['lookup', 'creation']) {
  test(`offscreen ${failingStep} failure is shared, cleared and retryable`, async () => {
    const h = harness();
    const object = failingStep === 'lookup' ? h.chrome.runtime : h.chrome.offscreen;
    const property = failingStep === 'lookup' ? 'getContexts' : 'createDocument';
    const original = object[property];
    let attempts = 0;
    object[property] = async (...args) => { attempts++; if (attempts === 1) throw new Error('synthetic failure'); return original(...args); };
    const result = await Promise.allSettled([h.context.setupOffscreenDocument(), h.context.setupOffscreenDocument()]);
    assert.equal(result[0].status, 'rejected');
    assert.equal(result[1].status, 'rejected');
    await h.context.setupOffscreenDocument();
    assert.equal(attempts, 2);
  });
}

test('open command creates inactive tabs in order and awaits each one', async () => {
  const h = harness();
  const gate = deferred();
  h.chrome.runtime.sendMessage = async () => ({ success: true, text: 'https://example.test/a\nhttp://example.test/b' });
  h.chrome.tabs.create = async options => { h.calls.creates.push(options); if (h.calls.creates.length === 1) await gate.promise; };
  const command = h.command('open-urls');
  await new Promise(setImmediate);
  assert.equal(h.calls.creates.length, 1);
  gate.resolve();
  await command;
  assert.deepEqual(plain(h.calls.creates), [{ url: 'https://example.test/a', active: false, windowId: 7 }, { url: 'http://example.test/b', active: false, windowId: 7 }]);
  assert.equal(h.calls.badges.at(-1), '');
});

for (const text of [Array(51).fill('https://example.test/').join('\n'), 'x'.repeat(1024 * 1024 + 1), 'file:///tmp/a', '']) {
  test(`rejected input opens zero tabs (${text.length} characters)`, async () => {
    const h = harness();
    h.chrome.runtime.sendMessage = async () => ({ success: true, text });
    await h.command('open-urls');
    assert.equal(h.calls.creates.length, 0);
    assert.equal(h.calls.badges.at(-1), '!');
  });
}

test('copy queries only last focused window and copies HTTP(S) URLs in tab order', async () => {
  const h = harness();
  h.chrome.tabs.query = async options => {
    h.calls.queries.push(options);
    return [{ url: 'https://one.test/' }, { url: 'chrome://newtab' }, {}, { url: 'http://two.test/a' }, { url: 'https://bad host/' }];
  };
  await h.command('copy-urls');
  assert.deepEqual(plain(h.calls.queries), [{ lastFocusedWindow: true }]);
  assert.deepEqual(plain(h.calls.messages), [{ target: 'offscreen', action: 'write-clipboard', text: 'https://one.test/\nhttp://two.test/a' }]);
});

test('copy intentionally writes empty text when focused window contains no web URLs', async () => {
  const h = harness();
  h.chrome.tabs.query = async () => [{ url: 'chrome://newtab' }];
  await h.command('copy-urls');
  assert.equal(h.calls.messages[0].text, '');
});

test('copy is not limited to 50 tabs, but oversized copy does not touch clipboard', async () => {
  const h = harness();
  h.chrome.tabs.query = async () => Array(51).fill({ url: 'https://example.test/' });
  await h.command('copy-urls');
  assert.equal(h.calls.messages[0].text.split('\n').length, 51);
  h.chrome.tabs.query = async () => [{ url: `https://example.test/${'a'.repeat(1024 * 1024)}` }];
  await h.command('copy-urls');
  assert.equal(h.calls.messages.length, 1);
  assert.match(h.calls.titles.at(-1), /clipboard was not changed/);
});

for (const response of [undefined, { success: false }, { text: 'https://example.test/' }, { success: true, text: 42 }]) {
  test(`failed/malformed clipboard read is visible and opens nothing: ${JSON.stringify(response)}`, async () => {
    const h = harness();
    h.chrome.runtime.sendMessage = async () => response;
    await h.command('open-urls');
    assert.equal(h.calls.creates.length, 0);
    assert.match(h.calls.titles.at(-1), /Could not read the clipboard/);
  });
}

test('clipboard write failure is not reported as success', async () => {
  const h = harness();
  h.chrome.runtime.sendMessage = async () => ({ success: false });
  await h.command('copy-urls');
  assert.match(h.calls.titles.at(-1), /Could not write the clipboard/);
  assert.equal(h.calls.badges.at(-1), '!');
});

test('message failure allows next command to retry, without exposing raw private errors', async () => {
  const h = harness();
  h.chrome.runtime.sendMessage = async () => { throw new Error('sensitive synthetic clipboard content'); };
  await h.command('open-urls');
  assert.ok(!h.calls.titles.join('').includes('sensitive'));
  h.chrome.runtime.sendMessage = async () => ({ success: true, text: 'https://retry.test/' });
  await h.command('open-urls');
  assert.equal(h.calls.creates.length, 1);
  assert.equal(h.calls.badges.at(-1), '');
});

test('tab query failure does not write the clipboard', async () => {
  const h = harness();
  h.chrome.tabs.query = async () => { throw new Error('synthetic query failure'); };
  await h.command('copy-urls');
  assert.equal(h.calls.messages.length, 0);
  assert.match(h.calls.titles.at(-1), /Could not read tabs/);
});

test('partial tab creation failure stops, reports count and does not silently retry', async () => {
  const h = harness();
  h.chrome.runtime.sendMessage = async () => ({ success: true, text: Array(3).fill('https://example.test/').join('\n') });
  h.chrome.tabs.create = async options => { h.calls.creates.push(options); if (h.calls.creates.length === 2) throw new Error('synthetic failure'); };
  await h.command('open-urls');
  assert.equal(h.calls.creates.length, 2);
  assert.match(h.calls.titles.at(-1), /Opened 1 of 3.*Check open tabs before retrying/);
});

test('overlapping shortcuts do not overlap clipboard operations or queue duplicate batches', async () => {
  const h = harness();
  const gate = deferred();
  h.chrome.runtime.sendMessage = async message => { h.calls.messages.push(message); await gate.promise; return { success: true, text: 'https://example.test/' }; };
  const first = h.command('open-urls');
  await new Promise(setImmediate);
  await h.command('open-urls');
  await h.command('copy-urls');
  assert.equal(h.calls.messages.length, 1);
  assert.equal(h.calls.queries.length, 0);
  assert.match(h.calls.titles.at(-1), /not queued/);
  gate.resolve();
  await first;
  assert.equal(h.calls.creates.length, 1);
  await h.command('copy-urls');
  assert.equal(h.calls.messages.length, 2);
});

test('unknown commands have no side effects', async () => {
  const h = harness();
  await h.command('unknown');
  assert.ok(Object.values(h.calls).every(list => list.length === 0));
});

test('status API failure never leaves the command lock stuck', async () => {
  const h = harness();
  h.chrome.action.setTitle = async () => { throw new Error('synthetic UI failure'); };
  await h.command('open-urls');
  await h.command('open-urls');
  assert.equal(h.calls.creates.length, 2);
});


test('open batch keeps its original window when focus changes between awaited tab creations', async () => {
  const h = harness();
  let focusedWindow = 7;
  h.chrome.windows.getLastFocused = async () => { h.calls.windows.push(focusedWindow); return { id: focusedWindow }; };
  h.chrome.runtime.sendMessage = async () => ({ success: true, text: 'https://example.test/a\nhttps://example.test/b' });
  const gate = deferred();
  h.chrome.tabs.create = async options => { h.calls.creates.push(options); if (h.calls.creates.length === 1) await gate.promise; };
  const pending = h.command('open-urls');
  await new Promise(setImmediate);
  focusedWindow = 99;
  gate.resolve();
  await pending;
  assert.deepEqual(h.calls.creates.map(tab => tab.windowId), [7, 7]);
  assert.equal(h.calls.windows.length, 1);
});

test('command tab window is preferred without looking up a later focused window', async () => {
  const h = harness();
  await h.command('open-urls', { windowId: 12 });
  assert.equal(h.calls.creates[0].windowId, 12);
  assert.equal(h.calls.windows.length, 0);
});

test('missing destination window aborts before reading clipboard or opening tabs', async () => {
  const h = harness();
  h.chrome.windows.getLastFocused = async () => { throw new Error('synthetic missing window'); };
  await h.command('open-urls');
  assert.equal(h.calls.creates.length, 0);
  assert.equal(h.calls.messages.length, 0);
  assert.match(h.calls.titles.at(-1), /Could not find the focused window/);
});


test('extra shortcut during final error reporting cannot overwrite the partial-open warning', async () => {
  const h = harness();
  const gate = deferred();
  h.chrome.tabs.create = async () => { throw new Error('synthetic tab failure'); };
  h.chrome.action.setTitle = async options => { h.calls.titles.push(options.title); await gate.promise; };
  const first = h.command('open-urls');
  await new Promise(setImmediate);
  await h.command('copy-urls');
  assert.equal(h.calls.titles.length, 1);
  assert.match(h.calls.titles[0], /Opened 0 of 1.*Check open tabs/);
  gate.resolve();
  await first;
  assert.equal(h.calls.badges.at(-1), '!');
});

test('a delayed busy status completes before the final result, never after it', async () => {
  const h = harness();
  const clipboardGate = deferred();
  const statusGate = deferred();
  h.chrome.runtime.sendMessage = async () => { await clipboardGate.promise; return { success: true, text: 'https://example.test/' }; };
  h.chrome.action.setTitle = async options => {
    h.calls.titles.push(options.title);
    if (h.calls.titles.length === 1) await statusGate.promise;
  };
  const first = h.command('open-urls');
  await new Promise(setImmediate);
  const extra = h.command('open-urls');
  await new Promise(setImmediate);
  clipboardGate.resolve();
  await new Promise(setImmediate);
  assert.equal(h.calls.titles.length, 1);
  statusGate.resolve();
  await Promise.all([first, extra]);
  assert.equal(h.calls.badges.at(-1), '');
  assert.equal(h.calls.titles.at(-1), 'Open All URLs: Alt+V to open, Alt+C to copy');
});
