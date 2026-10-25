import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareQuoteVision } from '@/lib/preventivi/quoteVision';
const id = 'a'.repeat(64);
const jpeg = 'data:image/jpeg;base64,' + btoa('\xff\xd8\xff' + '0'.repeat(100));
const file = () => new Blob(['local PNG'], { type: 'image/png' });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function fallback(mode: 'load' | 'error' | 'wait' | 'huge' = 'load') {
  vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('network error')));
  const revoke = vi.fn(); vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:local-image'), revokeObjectURL: revoke });
  vi.stubGlobal('Image', class {
    onload: (() => void) | null = null; onerror: (() => void) | null = null;
    naturalWidth = mode === 'huge' ? 100000 : 800; naturalHeight = 635;
    set src(_value: string) { if (mode !== 'wait') queueMicrotask(() => mode === 'error' ? this.onerror?.() : this.onload?.()); }
    removeAttribute() {}
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ fillRect: vi.fn(), drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(jpeg);
  return revoke;
}
describe('Preparazione immagini locali per AI visiva', () => {
  it('ripiega sulla decodifica locale se ImageBitmap rifiuta un PNG senza fare richieste di rete', async () => {
    const revoke = fallback(); const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const result = await prepareQuoteVision(file(), id, 1, new AbortController().signal);
    expect(result.dataUrl).toBe(jpeg); expect(fetch).not.toHaveBeenCalled(); expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:local-image');
  });
  it('interrompe e libera la copia locale quando la decodifica viene annullata', async () => {
    const revoke = fallback('wait'); const ctrl = new AbortController(); const pending = prepareQuoteVision(file(), id, 1, ctrl.signal);
    await Promise.resolve(); ctrl.abort(); await expect(pending).rejects.toThrow(); expect(revoke).toHaveBeenCalledOnce(); expect(HTMLCanvasElement.prototype.toDataURL).not.toHaveBeenCalled();
  });
  it('non espone network error come se fosse una chiamata remota già partita', async () => {
    const revoke = fallback('error'); await expect(prepareQuoteVision(file(), id, 1, new AbortController().signal)).rejects.toThrow('Decodifica locale'); expect(revoke).toHaveBeenCalledOnce();
  });
  it('mantiene i limiti dimensionali anche nel percorso alternativo', async () => {
    const revoke = fallback('huge'); await expect(prepareQuoteVision(file(), id, 1, new AbortController().signal)).rejects.toThrow('Dimensioni'); expect(revoke).toHaveBeenCalledOnce();
  });
  it('continua a usare ImageBitmap quando funziona e chiude la risorsa', async () => {
    fallback(); const close = vi.fn(); vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 800, height: 635, close }));
    await prepareQuoteVision(file(), id, 1, new AbortController().signal); expect(close).toHaveBeenCalledOnce(); expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
