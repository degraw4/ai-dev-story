import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createPreviewServer } from '../scripts/serve.mjs';

test('local server serves product assets and keeps project/private files unavailable', async () => {
  const server = createPreviewServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(base + '/src/game/rules.js');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /javascript/);
    assert.match(await response.text(), /applyAction/);
    assert.equal((await fetch(base + '/assets/branding/ai-dev-story-logo.png', { method: 'HEAD' })).status, 200);
    for (const path of ['/CONTEXT.md', '/.git/config', '/assets/%2e%2e/CONTEXT.md', '/src/%2e%2e%2f%2e%2e%2fetc/passwd', '/%E0%A4%A']) {
      assert.equal((await fetch(base + path)).status, 404, path);
    }
    assert.equal((await fetch(base + '/', { method: 'POST' })).status, 405);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
