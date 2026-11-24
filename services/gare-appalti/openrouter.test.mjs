import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import JSZip from 'jszip';
import { fixture } from '../../server/gare-journey/fixtures.mjs';
import { createGareAiHandler, pilotCompanyId } from '../../supabase/functions/gare-pilot-ai/handler.ts';

const bridgeSecret = 'a1'.repeat(32);
const proxySecret = 'b2'.repeat(32);
const token = 'synthetic.demo.jwt';
const outsider = 'synthetic.other.jwt';
const creditsModel = 'example/structured';
const requestId = 'b5c6f13c-642a-4c10-a567-da229b6d371b';
const filters = {
  q: 'manutenzione',
  territory: 'Lombardia',
  min_amount: null,
  max_amount: null,
  deadline_before: null,
  kind: null,
  notes: [],
};

function result(model, costUsd = 0) {
  return {
    content: JSON.stringify(filters),
    model,
    cost_usd: costUsd,
    cost_is_estimated: false,
    usage: { prompt_tokens: 120, completion_tokens: 30 },
    finish_reason: 'stop',
    latency_ms: 50,
    generation_id: 'synthetic-generation',
  };
}

function request({ jwt = token, secret = bridgeSecret, replacements } = {}) {
  return new Request('http://127.0.0.1/functions/v1/gare-pilot-ai', {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, 'X-Gare-AI-Key': secret, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'filtri',
      requestId,
      model: creditsModel,
      messages: [{ role: 'system', content: 'JSON' }, { role: 'user', content: 'Manutenzione in Lombardia' }],
      schema: { type: 'object' },
      deep: false,
      ...replacements,
    }),
  });
}

function dependencies(overrides = {}) {
  return {
    secret: bridgeSecret,
    model: creditsModel,
    profile: 'credits',
    authorize: async jwt => jwt === token,
    credit: async () => true,
    complete: async ({ model }) => result(model, 0.002),
    record: async () => true,
    ...overrides,
  };
}

test('Segreto, sessione, tenant, azione e modello vengono verificati prima del saldo', async () => {
  const handler = createGareAiHandler(dependencies({
    credit: async () => assert.fail('saldo consultato prima di verificare l’accesso'),
  }));
  assert.equal((await handler(request({ secret: '' }))).status, 403);
  assert.equal((await handler(request({ jwt: '' }))).status, 401);
  assert.equal((await handler(request({ jwt: outsider }))).status, 403);
  assert.equal((await handler(request({ replacements: { action: 'profilo' } }))).status, 400);
  assert.equal((await handler(request({ replacements: { model: 'altro/modello' } }))).status, 400);
  const privateImage = { role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,test' } }] };
  assert.equal((await handler(request({ replacements: { messages: [{ role: 'system', content: 'JSON' }, privateImage] } }))).status, 400);
});

test('Credito insufficiente blocca il modello. Una risposta a consumo attende la conferma del registro', async () => {
  let providerCalls = 0;
  const noCredit = createGareAiHandler(dependencies({
    credit: async () => false,
    complete: async () => { providerCalls++; return result(creditsModel); },
  }));
  assert.equal((await noCredit(request())).status, 402);
  assert.equal(providerCalls, 0);
  const pending = createGareAiHandler(dependencies({
    record: async (usage, id) => { assert.equal(id, requestId); assert.equal(usage.cost_usd, 0.002); return false; },
  }));
  assert.equal((await pending(request())).status, 503);
  const success = await createGareAiHandler(dependencies())(request());
  assert.equal(success.status, 200);
  assert.equal((await success.json()).usage.cost_usd, 0.002);
});

test('Profilo gratuito con prezzo massimo zero, rendicontazione verificata e struttura obbligatoria', async () => {
  const model = 'openrouter/free';
  const response = await createGareAiHandler(dependencies({
    profile: 'free',
    model,
    credit: async () => assert.fail('profilo gratuito ha consultato il saldo'),
    record: async () => assert.fail('profilo gratuito ha cercato di addebitare'),
    complete: async params => {
      assert.deepEqual(params.provider, {
        data_collection: 'deny', zdr: true, require_parameters: true,
        max_price: { prompt: 0, completion: 0 },
      });
      assert.equal(params.response_format.type, 'json_schema');
      return result(model);
    },
  }))(request({ replacements: { model } }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).usage.cost_usd, 0);
  const unclear = createGareAiHandler(dependencies({
    profile: 'free', model, complete: async () => ({ ...result(model), cost_is_estimated: true }),
  }));
  assert.equal((await unclear(request({ replacements: { model } }))).status, 503);
});

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
}

test('Worker HTTP locale, tenant, bridge strutturato e saldo nella normale rotta Filtri AI', async t => {
  const events = [];
  const handler = createGareAiHandler(dependencies({
    async credit(estimate) { events.push('credito'); assert.ok(estimate >= 2500); return true; },
    async complete(params) {
      events.push('modello');
      assert.match(params.messages[1].content, /Lombardia/);
      return result(params.model, 0.002);
    },
    async record() { events.push('registro'); return true; },
  }));
  const userId = 'f0000000-0000-4000-a000-000000000002';
  const participation = { id: randomUUID(), tender_id: randomUUID(), company_id: pilotCompanyId, stage: 'in_preparazione' };
  const storage = new Map();
  function source(name, bytes) {
    const id = randomUUID();
    const location = `${pilotCompanyId}/${id}/${name}`;
    storage.set(location, bytes);
    return { id, company_id: pilotCompanyId, tender_id: participation.tender_id, name,
      storage_path: location, size_bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
      category: 'fonte', version: 1 };
  }
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Clausola sintetica da conservare. CIG {{cig}}</w:t></w:r></w:p></w:body></w:document>');
  const template = source('modulo.docx', await zip.generateAsync({ type: 'nodebuffer' }));
  const dgueSource = source('request.xml', Buffer.from(fixture()));
  const docs = [template, dgueSource];
  let contract;
  async function bytes(request) {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    return Buffer.concat(chunks);
  }
  function sendJson(response, value, status = 200) {
    response.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(value));
  }
  const api = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/functions/v1/gare-pilot-ai') {
      const response = await handler(new Request(url, {
        method: req.method,
        headers: req.headers,
        body: req.method === 'POST' ? await bytes(req) : undefined,
      }));
      res.writeHead(response.status, { 'Content-Type': 'application/json' }).end(await response.text());
      return;
    }
    const pilot = req.headers.authorization === `Bearer ${token}`;
    const storageMatch = /^\/storage\/v1\/object\/(?:authenticated\/)?gare-private\/(.+)$/.exec(url.pathname);
    if (storageMatch && pilot) {
      const key = decodeURIComponent(storageMatch[1]);
      if (req.method === 'POST') {
        storage.set(key, await bytes(req));
        sendJson(res, { Key: `gare-private/${key}` });
      } else if (storage.has(key)) res.writeHead(200).end(storage.get(key));
      else sendJson(res, { message: 'File sintetico assente' }, 404);
      return;
    }
    const id = url.searchParams.get('id')?.replace(/^eq\./, '');
    if (url.pathname === '/rest/v1/gare_documents') {
      if (req.method === 'POST') {
        const input = JSON.parse(await bytes(req));
        const document = { id: randomUUID(), status: 'bozza', version: 1, ...input };
        docs.push(document);
        sendJson(res, document, 201);
      } else if (id) sendJson(res, docs.find(doc => doc.id === id));
      else sendJson(res, []);
      return;
    }
    if (url.pathname === '/rest/v1/gare_document_contracts') {
      if (req.method === 'POST') {
        contract = { id: randomUUID(), revision: 1, ...JSON.parse(await bytes(req)) };
        sendJson(res, contract, 201);
      } else if (req.method === 'PATCH') {
        contract = { ...contract, ...JSON.parse(await bytes(req)) };
        sendJson(res, contract);
      } else sendJson(res, id ? contract : contract ? [contract] : []);
      return;
    }
    const body = {
      '/auth/v1/user': { id: userId, is_anonymous: false },
      '/rest/v1/rpc/gare_pilot_role': pilot ? 'admin' : null,
      '/rest/v1/gare_companies': { id: pilotCompanyId, profile: {} },
      '/rest/v1/gare_tenders': [{ territory: 'Lombardia' }],
      '/rest/v1/gare_ai_jobs': [],
      '/rest/v1/gare_participations': participation,
      '/rest/v1/rpc/gare_source_current': true,
      '/rest/v1/gare_company_assets': [],
      '/rest/v1/gare_evidence_files': [],
      '/rest/v1/gare_company_facts': [],
      '/rest/v1/gare_asset_extractions': [],
      '/rest/v1/gare_preparation_runs': [],
    };
    if (!(url.pathname in body)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(body[url.pathname]));
  });
  const apiPort = await listen(api);
  t.after(() => api.close());
  const reserve = createServer();
  const workerPort = await listen(reserve);
  await new Promise(resolve => reserve.close(resolve));
  const worker = spawn(process.execPath, ['services/gare-appalti/server.mjs'], {
    env: {
      ...process.env,
      GARE_LOCAL_ONLY: '1',
      GARE_SUPABASE_URL: `http://127.0.0.1:${apiPort}`,
      GARE_SUPABASE_PUBLISHABLE_KEY: 'synthetic-publishable',
      GARE_SUPABASE_SERVICE_KEY: 'synthetic-service',
      GARE_PROXY_SECRET: proxySecret,
      GARE_AI_BRIDGE_SECRET: bridgeSecret,
      GARE_PORT: String(workerPort),
      GARE_AI_BACKEND: 'openrouter',
      GARE_AI_MODEL: creditsModel,
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  worker.stderr.on('data', chunk => { stderr += chunk; });
  t.after(() => worker.kill());
  const origin = `http://127.0.0.1:${workerPort}`;
  let health;
  for (let i = 0; i < 100 && !health; i++) {
    assert.equal(worker.exitCode, null, stderr);
    health = await fetch(origin + '/health', { headers: { 'X-Gare-Proxy-Key': proxySecret } }).catch(() => null);
    if (!health) await new Promise(resolve => setTimeout(resolve, 30));
  }
  assert.equal(health?.status, 204, stderr);
  const send = jwt => fetch(origin + '/api/gare-ai/filters', {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, 'X-Gare-Proxy-Key': proxySecret, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Manutenzione in Lombardia' }),
  });
  assert.equal((await send(outsider)).status, 403);
  assert.deepEqual(events, []);
  const done = await send(token);
  const body = await done.json();
  assert.equal(done.status, 200, JSON.stringify(body));
  assert.equal(body.backend, 'openrouter');
  assert.deepEqual(body.filters, filters);
  assert.deepEqual(events, ['credito', 'modello', 'registro']);

  await t.test('Compila il Word e genera due DGUE distinti senza inviare file al modello', {
    skip: process.env.GARE_DOC_SMOKE !== '1',
  }, async () => {
    async function documentOperation(path, payload) {
      const response = await fetch(origin + path, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'X-Gare-Proxy-Key': proxySecret, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      assert.equal(response.status, 200, JSON.stringify(body).slice(0, 450));
      return body;
    }
    const inspected = await documentOperation('/api/gare-templates/inspect', {
      participation_id: participation.id, document_id: template.id,
    });
    assert.ok(inspected.fields.some(field => field.key === 'cig'));
    const filled = await documentOperation('/api/gare-templates/fill', {
      contract_id: inspected.id, values: { cig: 'QA12345678' }, required_fields: ['cig'],
      confirmed: true, category: 'amministrativa', signature_required: false,
    });
    assert.equal(filled.document.status, 'bozza');
    assert.deepEqual(filled.missing_fields, []);
    const output = await JSZip.loadAsync(storage.get(filled.document.storage_path));
    const xml = await output.file('word/document.xml').async('string');
    assert.match(xml, /Clausola sintetica da conservare/);
    assert.match(xml, /QA12345678/);

    const dgue = await documentOperation('/api/gare-journey/dgue-inspect', {
      participation_id: participation.id, document_id: dgueSource.id,
    });
    assert.equal(dgue.questions.length, 2);
    for (const [name, role, answers] of [
      ['Mandataria sintetica', 'LE', { Q1: 'false' }],
      ['Mandante sintetica', 'GM', { Q1: 'true', Q2: 'Risposta condizionata di prova' }],
    ]) {
      const draft = await documentOperation('/api/gare-journey/dgue-export', {
        participation_id: participation.id, document_id: dgueSource.id,
        identity: { name, tax_id: 'QA-OPERATORE', signer: 'Firmatario sintetico', country: 'IT' },
        answers, lots: ['LOT-1'], confirmed: true, working_only: false,
        operator_role_code: role, group_name: 'RTI sintetico',
      });
      assert.equal(draft.validation.official.local_consistency, true);
      assert.equal(draft.document.status, 'bozza');
      assert.match(storage.get(draft.document.storage_path).toString(), new RegExp(name));
    }
    assert.deepEqual(events, ['credito', 'modello', 'registro']);
  });
});
