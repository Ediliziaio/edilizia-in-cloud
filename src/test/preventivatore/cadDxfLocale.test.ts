import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Readable, PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { spawn } from 'node:child_process';
import { convertDwgToDxf } from '../../../services/cad/dxfConverter.mts';
import { createLocalDxfHandler } from '../../../dev/preventivatore-ai/cadDxfHandler.mts';
const avvia = vi.fn<typeof spawn>();
const dxf = '0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n';
let root: string;
beforeEach(async () => { avvia.mockReset(); root = await mkdtemp(join(tmpdir(), 'eic-cad-test-')); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });
function native(mode: 'ok' | 'fail' | 'wait' | 'oversize' = 'ok') {
  avvia.mockImplementation((_binary, args, options) => {
    const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough() });
    const signal = options?.signal;
    signal?.addEventListener('abort', () => { child.emit('error', new Error('annullato')); setTimeout(() => child.emit('close', null), 0); }, { once: true });
    if (mode !== 'wait') setTimeout(() => { void (async () => {
      if (mode === 'fail') { child.emit('close', 1); return; }
      expect(await readFile(String(args?.at(-1)), 'utf8')).toBe('AC1021example');
      await writeFile(String(args?.[args.indexOf('-o') + 1]), mode === 'oversize' ? dxf.repeat(50) : dxf);
      child.stderr.emit('data', Buffer.from('Warning: unsupported object'));
      child.emit('close', 0);
    })(); }, 0);
    return child as unknown as ReturnType<typeof spawn>;
  });
}
const input = () => Readable.from([Buffer.from('AC1021example')]);
const opzioni = () => ({ temporaryRoot: root, binary: '/trusted/dwg2dxf', avviaProcesso: avvia as unknown as typeof spawn });
describe('Motore DWG → DXF: limiti, processo e pulizia', () => {
  it('preserva la provenienza e non trasmette segreti al processo nativo', async () => {
    native(); vi.stubEnv('OPENROUTER_API_KEY', 'synthetic-test-secret');
    try {
      const result = await convertDwgToDxf(input(), new AbortController().signal, opzioni());
      expect(result.bytes.toString()).toBe(dxf); expect(result.dimensioneOriginale).toBe(13); expect(result.segnalazioni).toBe(true);
      expect(result.sha256Originale).toMatch(/^[a-f\d]{64}$/);
      const [binary, args, options] = avvia.mock.calls[0];
      expect(binary).toBe('/trusted/dwg2dxf'); expect(args).toContain('r2018'); expect(options?.env).not.toHaveProperty('OPENROUTER_API_KEY'); expect(options?.shell).toBeUndefined();
      expect(await readdir(root)).toEqual([]);
    } finally { vi.unstubAllEnvs(); }
  });
  it.each(['garbage', ''])('non lancia il parser per un file non DWG: %j', async text => {
    await expect(convertDwgToDxf(Readable.from([Buffer.from(text)]), new AbortController().signal, opzioni())).rejects.toThrow();
    expect(avvia).not.toHaveBeenCalled(); expect(await readdir(root)).toEqual([]);
  });
  it('limita i byte ricevuti anche se la dimensione dichiarata è falsa', async () => {
    await expect(convertDwgToDxf(input(), new AbortController().signal, { ...opzioni(), maxInputBytes: 8 })).rejects.toThrow(/limite/);
    expect(avvia).not.toHaveBeenCalled(); expect(await readdir(root)).toEqual([]);
  });
  it.each(['fail', 'oversize'] as const)('pulisce i temporanei dopo %s', async mode => {
    native(mode); await expect(convertDwgToDxf(input(), new AbortController().signal, { ...opzioni(), maxOutputBytes: 100 })).rejects.toThrow();
    expect(await readdir(root)).toEqual([]);
  });
  it('attende l’arresto del processo dopo l’annullamento e poi cancella i temporanei', async () => {
    native('wait'); const ctrl = new AbortController(), pending = convertDwgToDxf(input(), ctrl.signal, opzioni());
    const assertion = pending.then((): null => null, e => e);
    await vi.waitFor(() => expect(avvia).toHaveBeenCalled()); ctrl.abort(); expect(await assertion).toBeInstanceOf(Error); expect(await readdir(root)).toEqual([]);
  });
});
const company = 'd2000000-0000-4000-a000-000000000002', request = 'a1000000-0000-4000-a000-000000000002';
function pair(headers: Record<string, string> = {}) {
  const req = Object.assign(input(), { method: 'POST', headers: { host: '127.0.0.1:18201', origin: 'http://127.0.0.1:18201', 'content-type': 'application/octet-stream',
    'x-eic-cad-company': company, 'x-eic-cad-request': request, 'x-eic-cad-size': '13', ...headers }, socket: { remoteAddress: '127.0.0.1' } }) as unknown as IncomingMessage;
  const res = Object.assign(new EventEmitter(), { destroyed: false, writableEnded: false, statusCode: 0, body: '', headers: new Map<string, unknown>(),
    setHeader(k: string, v: unknown) { this.headers.set(k, v); }, end(body = '') { this.body = body; this.writableEnded = true; } });
  return { req, res, response: res as unknown as ServerResponse };
}
const result = { bytes: Buffer.from(dxf), dimensioneOriginale: 13, sha256Originale: 'a'.repeat(64), segnalazioni: true, motore: 'LibreDWG' };
const setup = () => ({ lease: { acquire: vi.fn(() => true), release: vi.fn() }, convert: vi.fn(async () => result) });
describe('Endpoint commessa: solo locale, stessa richiesta, nessuna scrittura', () => {
  it.each([{ origin: 'https://other.example' }, { host: 'app.example' }, { 'sec-fetch-site': 'cross-site' }, { 'x-eic-cad-company': 'wrong' }, { 'x-eic-cad-size': '999999999' }, { 'content-type': 'text/html' }])('rifiuta %j prima della conversione', async headers => {
    const deps = setup(), p = pair(headers); await createLocalDxfHandler(deps.lease, deps.convert)(p.req, p.response);
    expect(p.res.statusCode).toBeGreaterThanOrEqual(400); expect(deps.convert).not.toHaveBeenCalled(); expect(deps.lease.release).not.toHaveBeenCalled();
  });
  it('restituisce DXF con hash, azienda e richiesta per il client', async () => {
    const deps = setup(), p = pair(); await createLocalDxfHandler(deps.lease, deps.convert)(p.req, p.response);
    expect(p.res.statusCode).toBe(200); expect(p.res.headers.get('X-Eic-Cad-Company')).toBe(company); expect(p.res.headers.get('X-Eic-Cad-Request')).toBe(request);
    expect(p.res.headers.get('X-Eic-Cad-Sha256')).toBe(result.sha256Originale); expect(p.res.body).toEqual(result.bytes); expect(deps.lease.release).toHaveBeenCalledOnce();
  });
  it('limita la concorrenza e non converte una seconda richiesta', async () => {
    const deps = setup(), p = pair(); deps.lease.acquire.mockReturnValue(false); await createLocalDxfHandler(deps.lease, deps.convert)(p.req, p.response);
    expect(p.res.statusCode).toBe(429); expect(deps.convert).not.toHaveBeenCalled();
  });
  it('libera il motore dopo un errore senza rivelare percorsi o diagnostica', async () => {
    const deps = setup(), p = pair(); deps.convert.mockRejectedValue(new Error('/private/customer/document with secret'));
    await createLocalDxfHandler(deps.lease, deps.convert)(p.req, p.response); expect(p.res.statusCode).toBe(422);
    expect(p.res.body).not.toContain('/private'); expect(deps.lease.release).toHaveBeenCalledOnce();
  });
  it('non accetta un risultato di dimensione diversa dall’originale', async () => {
    const deps = setup(), p = pair(); deps.convert.mockResolvedValue({ ...result, dimensioneOriginale: 8 }); await createLocalDxfHandler(deps.lease, deps.convert)(p.req, p.response);
    expect(p.res.statusCode).toBe(422); expect(deps.lease.release).toHaveBeenCalledOnce();
  });
});
