import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { workerConfig } from '../../server/gare-ai/runtime.mjs';
import { installGareAI } from '../../server/gare-ai/worker.mjs';

const config = workerConfig();
const proxyKey = Buffer.from(config.proxySecret);
const handlers = new Map();
installGareAI({ use(prefix, handler) { handlers.set(prefix, handler); } }, config);

function send(response, status, message) {
  response.writeHead(status, { 'Content-Type':'application/json', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' });
  response.end(JSON.stringify({ error: message }));
}

const server = createServer((request, response) => {
  const key = Buffer.from(String(request.headers['x-gare-proxy-key'] || ''));
  if (key.length !== proxyKey.length || !timingSafeEqual(key, proxyKey)) {
    return send(response, 403, 'Accesso non autorizzato');
  }
  if (request.method === 'GET' && request.url === '/health') {
    response.writeHead(204, { 'Cache-Control': 'no-store' }).end();
    return;
  }
  const route = /^\/api\/gare-([a-z]+)(\/[a-z][a-z-]*)$/.exec(request.url);
  const handler = route && handlers.get('/api/gare-' + route[1]);
  if (!handler || !['GET', 'POST'].includes(request.method)) {
    return send(response, 404, 'Operazione non disponibile');
  }
  request.url = route[2];
  Promise.resolve(handler(request, response, () => send(response, 404, 'Operazione non disponibile')))
    .catch(() => {
      if (!response.headersSent) send(response, 500, 'Operazione non riuscita');
      else response.end();
    });
});

server.listen(config.port, config.host);
for (const event of ['SIGTERM', 'SIGINT']) {
  process.once(event, () => server.close(() => process.exit(0)));
}
