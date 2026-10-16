const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readFileSync } = require('node:fs');
const source = readFileSync(require.resolve('../offscreen.js'), 'utf8');

function harness({ result = true, throws = false, fireCopy = true, hasClipboardData = true } = {}) {
  let listener;
  const elements = [];
  const calls = [];
  const listeners = new Map();
  const clipboard = { text: 'previous synthetic clipboard' };
  const document = {
    createElement(tag) {
      assert.equal(tag, 'textarea');
      const element = { value: '', removed: false, focus() { calls.push('focus'); }, select() { calls.push('select'); }, remove() { this.removed = true; } };
      elements.push(element);
      return element;
    },
    body: { appendChild() { calls.push('append'); } },
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) { assert.equal(listeners.get(type), listener); listeners.delete(type); },
    execCommand(command) {
      calls.push(command);
      if (throws) throw new Error('synthetic private clipboard content');
      if (command === 'paste' && result) elements.at(-1).value = 'https://synthetic.test/';
      if (command === 'copy' && result && fireCopy) {
        const event = {
          clipboardData: hasClipboardData ? { setData(type, text) { assert.equal(type, 'text/plain'); clipboard.text = text; } } : null,
          preventDefault() { clipboard.preventedDefault = true; }
        };
        listeners.get('copy')?.(event);
      }
      return result;
    }
  };
  const chrome = { runtime: { id: 'test', onMessage: { addListener: fn => { listener = fn; } } } };
  vm.runInNewContext(source, { chrome, document });
  function send(message, sender = { id: 'test' }) {
    let response;
    const returned = listener(message, sender, value => { response = JSON.parse(JSON.stringify(value)); });
    return { response, returned };
  }
  return { elements, calls, send, clipboard, listeners };
}

test('paste returns successful text and removes transient textarea', () => {
  const h = harness();
  assert.deepEqual(h.send({ target: 'offscreen', action: 'read-clipboard' }).response, { success: true, text: 'https://synthetic.test/' });
  assert.deepEqual(h.calls, ['append', 'focus', 'paste']);
  assert.equal(h.elements[0].removed, true);
});

test('copy writes supplied text and removes transient textarea', () => {
  const h = harness();
  assert.deepEqual(h.send({ target: 'offscreen', action: 'write-clipboard', text: 'synthetic text' }).response, { success: true });
  assert.equal(h.elements[0].value, 'synthetic text');
  assert.deepEqual(h.calls, ['append', 'focus', 'select', 'copy']);
  assert.equal(h.clipboard.text, 'synthetic text');
  assert.equal(h.clipboard.preventedDefault, true);
  assert.equal(h.listeners.size, 0);
  assert.equal(h.elements[0].removed, true);
});

for (const action of ['read-clipboard', 'write-clipboard']) {
  for (const options of [{ result: false }, { throws: true }]) {
    test(`${action} ${options.throws ? 'exception' : 'false return'} reports failure and cleans up`, () => {
      const h = harness(options);
      assert.deepEqual(h.send({ target: 'offscreen', action, text: 'synthetic' }).response, { success: false });
      assert.equal(h.elements[0].removed, true);
      assert.equal(h.listeners.size, 0);
    });
  }
}

test('wrong sender, target, unknown and malformed messages are ignored', () => {
  const h = harness();
  for (const message of [null, {}, { target: 'elsewhere', action: 'read-clipboard' }, { target: 'offscreen', action: 'unknown' }]) {
    assert.equal(h.send(message).response, undefined);
  }
  assert.equal(h.send({ target: 'offscreen', action: 'read-clipboard' }, { id: 'another-extension' }).response, undefined);
  assert.equal(h.elements.length, 0);
});

test('non-text write is rejected before touching DOM/clipboard; empty write is allowed', () => {
  const h = harness();
  assert.deepEqual(h.send({ target: 'offscreen', action: 'write-clipboard', text: 42 }).response, { success: false });
  assert.equal(h.elements.length, 0);
  assert.deepEqual(h.send({ target: 'offscreen', action: 'write-clipboard', text: '' }).response, { success: true });
  assert.equal(h.clipboard.text, '');
  assert.equal(h.clipboard.preventedDefault, true);
  assert.equal(h.listeners.size, 0);
});

for (const options of [{ fireCopy: false }, { hasClipboardData: false }]) {
  test(`copy reports failure when data was not supplied: ${JSON.stringify(options)}`, () => {
    const h = harness(options);
    assert.deepEqual(h.send({ target: 'offscreen', action: 'write-clipboard', text: '' }).response, { success: false });
    assert.equal(h.clipboard.text, 'previous synthetic clipboard');
    assert.equal(h.elements[0].removed, true);
    assert.equal(h.listeners.size, 0);
  });
}
