import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetWarmupState, warmupCriticalEdgeFunctions } from '@/lib/utils/edgeWarmup';
beforeEach(() => {
  resetWarmupState();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubGlobal('window', {location:{hostname:'app.ediliziaincloud.com'}});
});
afterEach(() => {
  document.querySelectorAll('link[data-eic-api-preconnect]').forEach(link => link.remove());
  vi.unstubAllGlobals(); vi.unstubAllEnvs();
});
describe('post-login senza chiamate Edge anonime', () => {
  it('preconnette una sola volta, senza fetch né worker', () => {
    const fetchSpy = vi.fn(); vi.stubGlobal('fetch', fetchSpy);
    warmupCriticalEdgeFunctions(); warmupCriticalEdgeFunctions();
    expect(fetchSpy).not.toHaveBeenCalled();
    const links = document.querySelectorAll<HTMLLinkElement>('link[data-eic-api-preconnect]');
    expect(links).toHaveLength(1);
    expect(links[0].rel).toBe('preconnect');
    expect(links[0].href).toBe('https://example.supabase.co/');
  });
  it('non duplica la preconnessione dopo reset', () => {
    warmupCriticalEdgeFunctions(); resetWarmupState(); warmupCriticalEdgeFunctions();
    expect(document.querySelectorAll('link[data-eic-api-preconnect]')).toHaveLength(1);
  });
  it.each(['localhost','127.0.0.1'])('nessuna preconnessione in locale: %s', hostname => {
    vi.stubGlobal('window', {location:{hostname}});
    warmupCriticalEdgeFunctions();
    expect(document.querySelector('link[data-eic-api-preconnect]')).toBeNull();
  });
  it.each(['','invalid','http://example.supabase.co'])('configurazione non valida non produce rete: %s', url => {
    vi.stubEnv('VITE_SUPABASE_URL', url);
    warmupCriticalEdgeFunctions();
    expect(document.querySelector('link[data-eic-api-preconnect]')).toBeNull();
  });
});
