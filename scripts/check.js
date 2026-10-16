const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

process.chdir(path.join(__dirname, '..'));
for (const file of ['background.js', 'offscreen.js', ...readdirSync('scripts').filter(f => f.endsWith('.js')).map(f => `scripts/${f}`), ...readdirSync('tests').filter(f => f.endsWith('.js')).map(f => `tests/${f}`)]) {
  execFileSync(process.execPath, ['--check', file]);
}
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.minimum_chrome_version, '116');
assert.equal(manifest.background.service_worker, 'background.js');
assert.deepEqual(manifest.permissions, ['tabs', 'clipboardRead', 'clipboardWrite', 'offscreen']);
assert.equal(manifest.host_permissions, undefined);
assert.equal(manifest.content_scripts, undefined);
assert.equal(manifest.commands['open-urls'].suggested_key.default, 'Alt+V');
assert.equal(manifest.commands['copy-urls'].suggested_key.default, 'Alt+C');
assert.ok(manifest.action.default_title);
assert.match(readFileSync('offscreen.html', 'utf8'), /<script src="offscreen\.js"><\/script>/);
console.log('Syntax, manifest, unchanged permissions, and entrypoint checks passed.');
