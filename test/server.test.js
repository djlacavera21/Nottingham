import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { makeServer } from '../server.js';

test('workspace serves the HTML, module graph and styles with restrictive headers', async t => {
  const server = makeServer().listen(0, '127.0.0.1');
  await once(server, 'listening'); t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const html = await fetch(base);
  assert.equal(html.status, 200); assert.match(html.headers.get('content-security-policy'), /default-src 'self'/);
  const content = await html.text(); assert.match(content, /Synthetic prices/);
  const modules = [...content.matchAll(/(?:href|src)="(\/(?:app\.js|styles\.css))"/g)].map(m => m[1]);
  const graph = new Set(modules);
  for (const route of graph) {
    const response = await fetch(`${base}${route}`); assert.equal(response.status, 200, route);
    const source = await response.text();
    if (route.endsWith('.js')) {
      assert.match(response.headers.get('content-type'), /javascript/);
      for (const match of source.matchAll(/from ['"]([^'"]+)['"]/g)) {
        const resolved = new URL(match[1], `${base}${route}`).pathname;
        graph.add(resolved);
      }
    }
  }
  assert.ok(graph.has('/src/closure.js')); assert.ok(graph.has('/src/paper-broker.js'));
  assert.deepEqual(await (await fetch(`${base}/health`)).json(), { status: 'ok', mode: 'paper', liveTrading: false });
  for (const route of ['/package.json', '/.git/config', '/src/not-public.js', '/%2e%2e/README.md']) assert.equal((await fetch(`${base}${route}`)).status, 404);
  assert.equal((await fetch(base, { method: 'POST' })).status, 405);
  assert.equal(await (await fetch(base, { method: 'HEAD' })).text(), '');
});
