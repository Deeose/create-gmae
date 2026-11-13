import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildWeb } from '../scripts/build-web.mjs';
import { createStaticServer } from '../scripts/serve.mjs';

test('정적 웹 결과물이 엔진·데이터와 함께 독립적으로 제공된다', async () => {
  const root = await buildWeb();
  const server = createStaticServer(root);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await fetch(base);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /text\/html/);
    assert.match(await page.text(), /type="module"/);
    const script = await fetch(`${base}/app.js`);
    assert.equal(script.status, 200);
    assert.match(script.headers.get('content-type'), /javascript/);
    assert.match(await script.text(), /core\/engine.js/);
    for (const [file, original] of [
      ['core/engine.js', '../src/core/engine.js'],
      ['core/session.js', '../src/core/session.js'],
      ['data/events.json', '../data/events.json'],
    ]) {
      const response = await fetch(`${base}/${file}`);
      assert.equal(response.status, 200);
      assert.equal(await response.text(), await readFile(new URL(original, import.meta.url), 'utf8'));
    }
    for (const file of ['.git/config', 'package.json', 'saves/slot-1.json', 'missing.js']) {
      assert.equal((await fetch(`${base}/${file}`)).status, 404);
    }
    const head = await fetch(base, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    assert.equal((await fetch(base, { method: 'POST' })).status, 405);
    assert.ok((await readFile(join(root, 'styles.css'), 'utf8')).length > 0);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
