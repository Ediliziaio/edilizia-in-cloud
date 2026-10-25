/// <reference types="node" />
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { createCadAuthorizer } from './authorization.mts';
import { createCadHandler } from './handler.mts';
import { convertCad } from './converter.mts';
const authorize = createCadAuthorizer(process.env.CAD_SUPABASE_URL ?? '', process.env.CAD_SUPABASE_PUBLISHABLE_KEY ?? '');
const origins = (process.env.CAD_APP_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean);
const version = execFileSync('dwgread', ['--version'], { encoding: 'utf8', timeout: 5000, maxBuffer: 16000 });
if (!version.includes('0.14')) throw new Error('Expected pinned LibreDWG 0.14');
const server = createServer({ maxHeaderSize: 16_384 }, (req, res) => { void handler(req, res).catch(() => { if (!res.destroyed) { res.statusCode = 503; res.end(); } }); });
const handler = createCadHandler({ origins, authorize, convert: convertCad });
server.requestTimeout = 245_000; server.headersTimeout = 15_000; server.keepAliveTimeout = 5000; server.maxConnections = 16;
const host = process.env.CAD_LISTEN_HOST ?? '127.0.0.1';
if (!['127.0.0.1', '0.0.0.0'].includes(host)) throw new Error('CAD listen host invalid');
server.listen(8094, host);
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { handler.stop(); server.close(); setTimeout(() => process.exit(0), 10_000).unref(); });
