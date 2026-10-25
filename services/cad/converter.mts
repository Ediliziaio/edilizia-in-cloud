/// <reference types="node" />
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, open, rm, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cadSignature, CAD_MAX_BYTES, readQuoteCad } from '../../src/lib/preventivi/quoteCad.ts';
const exec = promisify(execFile);
export async function convertCad(stream: AsyncIterable<Uint8Array>, name: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const dir = await mkdtemp(join(tmpdir(), 'eic-cad-'));
  const controller = new AbortController(), abort = () => controller.abort(signal.reason);
  signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(), 230_000);
  let monitor: ReturnType<typeof setInterval> | undefined;
  // Neither provider keys nor user JWTs are inherited by native parsers.
  const env = { PATH: process.env.PATH, LANG: 'C.UTF-8' };
  try {
    const input = join(dir, 'input.dwg'), output = join(dir, 'output.json');
    const handle = await open(input, 'wx', 0o600), hash = createHash('sha256');
    let size = 0, magic = Buffer.alloc(0);
    try {
      for await (const chunk of stream) {
        controller.signal.throwIfAborted(); const bytes = Buffer.from(chunk); size += bytes.length;
        if (size > CAD_MAX_BYTES) throw new Error('CAD input limit');
        if (magic.length < 6) magic = Buffer.concat([magic, bytes.subarray(0, 6 - magic.length)]);
        hash.update(bytes); await handle.writeFile(bytes);
      }
    } finally { await handle.close(); }
    if (!size || !cadSignature(magic)) throw new Error('Invalid DWG signature');
    controller.signal.throwIfAborted();
    monitor = setInterval(() => { void stat(output).then(s => { if (s.size > 768 * 1024 * 1024) controller.abort(); }).catch(() => {}); }, 250);
    await exec('dwgread', ['-v0', '-O', 'minJSON', '-o', output, input], { timeout: 180_000, maxBuffer: 120_000, signal: controller.signal, cwd: dir, env });
    if ((await stat(output)).size > 768 * 1024 * 1024) throw new Error('CAD output limit');
    const worker = fileURLToPath(new URL('./worker.mts', import.meta.url));
    const safeName = name.replace(/[\x00-\x1f/\\]/g, '_').slice(0, 180) || 'disegno.dwg';
    const { stdout } = await exec(process.execPath, ['--max-old-space-size=256', worker, output, hash.digest('hex'), String(size), safeName], { timeout: 55_000, maxBuffer: 180_000, signal: controller.signal, cwd: dir, env });
    controller.signal.throwIfAborted(); return readQuoteCad(JSON.parse(stdout));
  } finally {
    clearTimeout(timer); if (monitor) clearInterval(monitor); signal.removeEventListener('abort', abort);
    // Exact directory created above, never a request-supplied or original path.
    await rm(dir, { recursive: true, force: true });
  }
}
