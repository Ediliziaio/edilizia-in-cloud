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
  if (supabaseUrl.protocol !== 'https:' || supabaseUrl.pathname !== '/' ||
      supabaseUrl.username || supabaseUrl.password || supabaseUrl.search || supabaseUrl.hash) {
    throw new Error('Origine Supabase HTTPS richiesta');
  }
  if (!env.GARE_SUPABASE_PUBLISHABLE_KEY || !env.GARE_SUPABASE_SERVICE_KEY ||
      env.GARE_SUPABASE_PUBLISHABLE_KEY === env.GARE_SUPABASE_SERVICE_KEY ||
      !/^[a-f0-9]{64}$/.test(env.GARE_PROXY_SECRET || '')) {
    throw new Error('Configurazione del worker Gare incompleta');
  }
  return {
    API_URL: supabaseUrl.origin,
    ANON_KEY: env.GARE_SUPABASE_PUBLISHABLE_KEY,
    SERVICE_ROLE_KEY: env.GARE_SUPABASE_SERVICE_KEY,
    proxySecret: env.GARE_PROXY_SECRET,
  };
}
