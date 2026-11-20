import { spawn } from 'node:child_process';
import { access, mkdtemp, open, readFile, rm, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { riconosciFormato } from '../../src/lib/distinta/cad/leggiDxf.ts';
import { MAX_DWG_BYTE, MAX_DXF_CONVERTITO_BYTE } from '../../src/lib/distinta/cad/protocolloDwg.ts';

export interface RisultatoDwgDxf { bytes: Buffer; dimensioneOriginale: number; sha256Originale: string; segnalazioni: boolean; motore: string }
interface Opzioni { binary?: string; temporaryRoot?: string; maxInputBytes?: number; maxOutputBytes?: number; timeoutMs?: number; avviaProcesso?: typeof spawn }

async function motoreLocale(binary?: string): Promise<string> {
  if (binary || process.env.EIC_CAD_DWG2DXF) return binary ?? process.env.EIC_CAD_DWG2DXF!;
  const locale = join(homedir(), '.local/share/ediliziaincloud/cad/libredwg-0.14/bin/dwg2dxf');
  try { await access(locale, constants.X_OK); return locale; } catch { return 'dwg2dxf'; }
}

/** Processo nativo isolato dai segreti dell'app; restituisce il DXF, senza salvare documenti o chiamare AI. */
export async function convertDwgToDxf(stream: AsyncIterable<Uint8Array>, signal: AbortSignal, options: Opzioni = {}): Promise<RisultatoDwgDxf> {
  signal.throwIfAborted();
  const maxInput = options.maxInputBytes ?? MAX_DWG_BYTE, maxOutput = options.maxOutputBytes ?? MAX_DXF_CONVERTITO_BYTE;
  const dir = await mkdtemp(join(options.temporaryRoot ?? tmpdir(), 'eic-dwg-dxf-'));
  const ctrl = new AbortController();
  const abort = () => ctrl.abort(signal.reason);
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  const timer = setTimeout(() => ctrl.abort(new Error('Conversione DWG oltre il tempo massimo.')), options.timeoutMs ?? 180_000);
  let monitor: ReturnType<typeof setInterval> | undefined;
  try {
    const input = join(dir, 'input.dwg'), output = join(dir, 'output.dxf');
    const handle = await open(input, 'wx', 0o600), hash = createHash('sha256');
    let size = 0, magic = Buffer.alloc(0);
    try {
      for await (const chunk of stream) {
        ctrl.signal.throwIfAborted(); const bytes = Buffer.from(chunk); size += bytes.length;
        if (size > maxInput) throw new Error('DWG oltre il limite di caricamento.');
        if (magic.length < 6) magic = Buffer.concat([magic, bytes.subarray(0, 6 - magic.length)]);
        if (magic.length === 6 && riconosciFormato(magic) !== 'dwg') throw new Error('Il contenuto non è un DWG.');
        hash.update(bytes); await handle.writeFile(bytes);
      }
    } finally { await handle.close(); }
    if (!size || riconosciFormato(magic) !== 'dwg') throw new Error('DWG vuoto o non riconosciuto.');
    ctrl.signal.throwIfAborted();
    const binary = await motoreLocale(options.binary);
    let tail = '', segnalazioni = false;
    await new Promise<void>((resolve, reject) => {
      // File name and paths are generated above; no shell, JWT or provider variables reach the parser.
      const child = (options.avviaProcesso ?? spawn)(binary, ['-v1', '--as', 'r2018', '-o', output, input], {
        cwd: dir, env: { PATH: process.env.PATH, LANG: 'C.UTF-8' }, signal: ctrl.signal, stdio: ['ignore', 'pipe', 'pipe'],
      });
      const diagnostica = (chunk: Buffer) => { tail = (tail + chunk.toString('utf8')).slice(-4096); segnalazioni ||= /(?:Warning|ERROR):/.test(tail); };
      child.stdout.on('data', diagnostica); child.stderr.on('data', diagnostica);
      let erroreProcesso: Error | undefined;
      child.once('error', error => { erroreProcesso = error; });
      // Cleanup waits until the native process has actually stopped, including cancellation.
      child.once('close', code => erroreProcesso ? reject(erroreProcesso) : code === 0 ? resolve() : reject(new Error('Conversione DWG non riuscita: formato o oggetti non supportati.')));
      monitor = setInterval(() => { void stat(output).then(s => {
        if (s.size > maxOutput) ctrl.abort(new Error('Il DXF generato supera il limite di lettura.'));
      }).catch(() => {}); }, 100);
    });
    ctrl.signal.throwIfAborted();
    const info = await stat(output);
    if (!info.size || info.size > maxOutput) throw new Error('DXF generato vuoto o troppo grande.');
    const bytes = await readFile(output);
    if (riconosciFormato(bytes.subarray(0, 64)) !== 'dxf') throw new Error('Il convertitore non ha prodotto un DXF di testo.');
    ctrl.signal.throwIfAborted();
    return { bytes, dimensioneOriginale: size, sha256Originale: hash.digest('hex'), segnalazioni, motore: 'LibreDWG' };
  } finally {
    clearTimeout(timer); if (monitor) clearInterval(monitor); signal.removeEventListener('abort', abort);
    await rm(dir, { recursive: true, force: true });
  }
}
