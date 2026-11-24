import assert from 'node:assert/strict';
import test from 'node:test';
import { onRequest } from '../../functions/api/gare/[[path]].ts';

const browserOrigin = 'https://app.example.test';
const workerOrigin = 'https://worker.example.test';
const proxySecret = 'ab'.repeat(32);
const env = { GARE_WORKER_ORIGIN: workerOrigin, GARE_PROXY_SECRET: proxySecret };

test('Il proxy resta chiuso senza sessione, configurazione o origine consentita', async () => {
  const params = { path: ['ai', 'status'] };
  const url = browserOrigin + '/api/gare/ai/status';
  assert.equal((await onRequest({ request: new Request(url), env, params })).status, 401);
  const authorization = { Authorization: 'Bearer jwt.valido.test' };
  assert.equal((await onRequest({ request: new Request(url, { headers: authorization }), env: {}, params })).status, 503);
  const external = { ...authorization, Origin: 'https://altro.example.test' };
  assert.equal((await onRequest({ request: new Request(url, { headers: external }), env, params })).status, 403);
  assert.equal((await onRequest({ request: new Request(url, { headers: authorization }), env, params: { path: ['ai', '../status'] } })).status, 404);
});

test('Il proxy conserva il POST, sostituisce il segreto e impedisce reindirizzamenti', async t => {
  const body = '{"format":"docx"}';
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url.href, workerOrigin + '/api/gare-templates/fill');
    assert.equal(init.redirect, 'error');
    assert.equal(init.method, 'POST');
    assert.equal(init.headers['X-Gare-Proxy-Key'], proxySecret);
    assert.equal(init.headers.Authorization, 'Bearer jwt.valido.test');
    assert.equal(await new Response(init.body).text(), body);
    return new Response('{"status":"draft"}', { headers: { 'X-Upstream-Internal': 'non inoltrare' } });
  });
  const request = new Request(browserOrigin + '/api/gare/templates/fill', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Gare-Proxy-Key': 'segreto-falso',
      Authorization: 'Bearer jwt.valido.test',
      Origin: browserOrigin,
    },
    body,
  });
  const result = await onRequest({ request, env, params: { path: ['templates', 'fill'] } });
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('Cache-Control'), 'no-store');
  assert.equal(result.headers.get('X-Upstream-Internal'), null);
  assert.deepEqual(await result.json(), { status: 'draft' });
});
