// Keeps the service worker's VERSION in step with the files it caches.
//   node --test                          fails when VERSION is out of date
//   node tests/sw-version.test.js --write     updates VERSION in sw.js
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.join(__dirname, '..');
const swPath = path.join(root, 'sw.js');

function read() {
  const sw = fs.readFileSync(swPath, 'utf8');
  const assets = [...sw.match(/const ASSETS = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).filter((a) => a !== './');
  const hash = crypto.createHash('sha256');
  for (const asset of assets) hash.update(asset).update(fs.readFileSync(path.join(root, asset)));
  return { sw, assets, expected: hash.digest('hex').slice(0, 12), current: sw.match(/const VERSION = '([^']*)';/)[1] };
}

if (process.argv.includes('--write')) {
  const { sw, expected } = read();
  fs.writeFileSync(swPath, sw.replace(/const VERSION = '[^']*';/, "const VERSION = '" + expected + "';"));
  console.log('sw.js VERSION = ' + expected);
} else {
  const test = require('node:test');
  const assert = require('node:assert/strict');
  test('service worker version matches the cached files', () => {
    const { assets, expected, current } = read();
    assert.ok(assets.includes('js/app.js') && assets.includes('index.html'));
    assert.equal(current, expected, 'run: node tests/sw-version.test.js --write');
  });
}
