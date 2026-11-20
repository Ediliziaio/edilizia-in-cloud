import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { File as NodeFile } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import { convertiDwgLocale } from '@/lib/distinta/cad/convertiDwg';
const company = 'd2000000-0000-4000-a000-000000000002';
const file = () => new NodeFile(['AC1021example'], 'originale.dwg') as unknown as File;
const dxf = '0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n';
const call = vi.fn<typeof fetch>();
const auth = vi.hoisted(() => ({ sessione: true }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: auth.sessione ? { access_token: "synthetic-session-token" } : null }, error: null as null }) } } }));
beforeEach(() => {
  vi.stubGlobal('location', { hostname: '127.0.0.1' });
  vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('File', NodeFile); vi.stubGlobal('fetch', call); call.mockReset(); auth.sessione = true;
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
async function risposta(_url: unknown, init?: RequestInit, patch: Record<string, string> = {}, body = dxf) {
  const headers = new Headers(init?.headers), original = init?.body as File;
  const hash = Buffer.from(await webcrypto.subtle.digest('SHA-256', await original.arrayBuffer())).toString('hex');
  return new Response(body, { headers: { 'Content-Type': 'application/dxf', 'X-Eic-Cad-Company': headers.get('X-Eic-Cad-Company')!,
    'X-Eic-Cad-Request': headers.get('X-Eic-Cad-Request')!, 'X-Eic-Cad-Input-Size': String(original.size),
    'X-Eic-Cad-Order': headers.get('X-Eic-Cad-Order') ?? '',
    'X-Eic-Cad-Sha256': hash, 'X-Eic-Cad-Engine': 'LibreDWG', 'X-Eic-Cad-Warnings': '1', ...patch } });
}
describe('DWG della commessa: originale e risposta correlati', () => {
  it('legge il DXF derivato mantenendo nome, hash e avvisi dell’originale, senza credenziali o AI', async () => {
    call.mockImplementation(risposta);
    const originale = file(), result = await convertiDwgLocale(originale, company, new AbortController().signal);
    expect(await result.file.text()).toBe(dxf); expect(result.file.name).toBe('originale.dxf');
    expect(result.provenienza).toMatchObject({ formato_originale: 'dwg', formato_lettura: 'dxf', segnalazioni: true, sha256_originale: expect.stringMatching(/^[a-f\d]{64}$/) });
    expect(call).toHaveBeenCalledTimes(1); expect(call.mock.calls[0]).toMatchObject(['/__commessa-cad/dxf', { body: originale, credentials: 'omit', redirect: 'error' }]);
    expect(new Headers(call.mock.calls[0][1]?.headers).has('Authorization')).toBe(false);
  });
  it.each([{ 'X-Eic-Cad-Company': 'altra' }, { 'X-Eic-Cad-Request': 'precedente' }, { 'X-Eic-Cad-Sha256': '0'.repeat(64) }, { 'X-Eic-Cad-Input-Size': '1' }, { 'Content-Type': 'text/html' }])('rifiuta la risposta incoerente %j', async patch => {
    call.mockImplementation((url, init) => risposta(url, init, patch));
    await expect(convertiDwgLocale(file(), company, new AbortController().signal)).rejects.toThrow(/non corrisponde/);
  });
  it('rifiuta un finto DXF anche con metadati corretti', async () => {
    call.mockImplementation((url, init) => risposta(url, init, {}, '<html>errore</html>'));
    await expect(convertiDwgLocale(file(), company, new AbortController().signal)).rejects.toThrow(/non è un DXF/);
  });
  it.each([503, 429, 413, 422])('mostra un errore operativo per HTTP %s', async status => {
    call.mockResolvedValue(new Response('', { status }));
    await expect(convertiDwgLocale(file(), company, new AbortController().signal)).rejects.toThrow();
  });
  it('non invia file da ambienti pubblici o in produzione', async () => {
    vi.stubGlobal('location', { hostname: 'app.ediliziaincloud.com' });
    await expect(convertiDwgLocale(file(), company, new AbortController().signal)).rejects.toThrow(/non attiva/);
    vi.stubGlobal('location', { hostname: '127.0.0.1' }); vi.stubEnv('DEV', false);
    await expect(convertiDwgLocale(file(), company, new AbortController().signal)).rejects.toThrow(/non attiva/);
    expect(call).not.toHaveBeenCalled();
  });
  it('una lettura già annullata non avvia conversioni', async () => {
    const ctrl = new AbortController(); ctrl.abort();
    await expect(convertiDwgLocale(file(), company, ctrl.signal)).rejects.toThrow(); expect(call).not.toHaveBeenCalled();
  });
  it('online invia solo al backend configurato con la sessione e la commessa corrette', async () => {
    vi.stubEnv('DEV', false); vi.stubEnv('VITE_SUPABASE_URL', 'https://backend.example'); vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'synthetic-public-key');
    const order = 'a1000000-0000-4000-a000-000000000001'; call.mockImplementation(risposta);
    const result = await convertiDwgLocale(file(), company, new AbortController().signal, order);
    expect(result.provenienza.trattamento).toBe('servizio');
    expect(call.mock.calls[0]).toMatchObject(['https://backend.example/functions/v1/cad-leggi-commessa', { headers: { Authorization: 'Bearer synthetic-session-token', 'X-Eic-Cad-Order': order }, credentials: 'omit', redirect: 'error' }]);
  });
  it('una sessione scaduta non invia il disegno al servizio online', async () => {
    vi.stubEnv('DEV', false); vi.stubEnv('VITE_SUPABASE_URL', 'https://backend.example'); auth.sessione = false;
    await expect(convertiDwgLocale(file(), company, new AbortController().signal, 'a1000000-0000-4000-a000-000000000001')).rejects.toThrow(/Accedi nuovamente/);
    expect(call).not.toHaveBeenCalled();
  });
});
