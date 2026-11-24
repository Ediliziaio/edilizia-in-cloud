import { execFile as runExecutable } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

export const pilotCompanyId = 'd2000000-0000-4000-a000-000000000002';
export const runtimeDir = join(tmpdir(), 'eic-gare');
export const python = process.env.GARE_PYTHON || 'python3';

function parserOptions(options) {
  // Parsers process untrusted files and should never inherit API credentials.
  return {
    ...options,
    env: {
      PATH: process.env.PATH,
      HOME: tmpdir(),
      TMPDIR: tmpdir(),
      LANG: 'C.UTF-8',
      LC_ALL: 'C.UTF-8',
    },
  };
}

export function execFile(file, args, options, callback) {
  return runExecutable(file, args, parserOptions(options), callback);
}
execFile[promisify.custom] = (file, args, options) =>
  runExecutable[promisify.custom](file, args, parserOptions(options));

export function workerConfig(env = process.env) {
  const supabaseUrl = new URL(env.GARE_SUPABASE_URL);
  const local = env.GARE_LOCAL_ONLY === '1';
  const loopback = supabaseUrl.protocol === 'http:' && supabaseUrl.hostname === '127.0.0.1';
  if ((local ? !loopback : supabaseUrl.protocol !== 'https:') || supabaseUrl.pathname !== '/' ||
      supabaseUrl.username || supabaseUrl.password || supabaseUrl.search || supabaseUrl.hash) {
    throw new Error(local ? 'Il collaudo richiede Supabase su 127.0.0.1.' : 'Origine Supabase HTTPS richiesta');
  }
  if (!env.GARE_SUPABASE_PUBLISHABLE_KEY || !env.GARE_SUPABASE_SERVICE_KEY ||
      env.GARE_SUPABASE_PUBLISHABLE_KEY === env.GARE_SUPABASE_SERVICE_KEY ||
      !/^[a-f0-9]{64}$/.test(env.GARE_PROXY_SECRET || '')) {
    throw new Error('Configurazione del worker Gare incompleta');
  }
  const aiBridgeSecret = env.GARE_AI_BRIDGE_SECRET || '';
  if (aiBridgeSecret && !/^[a-f0-9]{64}$/.test(aiBridgeSecret)) throw Error('Segreto OpenRouter Gare non valido');
  const port = Number(env.GARE_PORT || 8081);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Porta Gare non valida');
  return {
    aiBridgeSecret,
    port,
    host: !local && env.GARE_BIND_ALL === '1' ? '0.0.0.0' : '127.0.0.1',
    API_URL: supabaseUrl.origin,
    ANON_KEY: env.GARE_SUPABASE_PUBLISHABLE_KEY,
    SERVICE_ROLE_KEY: env.GARE_SUPABASE_SERVICE_KEY,
    proxySecret: env.GARE_PROXY_SECRET,
  };
}
