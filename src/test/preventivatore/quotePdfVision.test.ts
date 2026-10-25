import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const pdf = vi.hoisted(() => ({ getDocument: vi.fn(), getPage: vi.fn(), destroy: vi.fn(), render: vi.fn(), cancel: vi.fn(), viewport: vi.fn() }));
vi.mock('pdfjs-dist', () => ({ getDocument: pdf.getDocument, GlobalWorkerOptions: {} }));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '/local-worker.mjs' }));
import { prepareQuoteVision } from '@/lib/preventivi/quoteVision';
const id = 'a'.repeat(64);
const jpeg = 'data:image/jpeg;base64,' + btoa('\xff\xd8\xff' + '0'.repeat(100));
const file = () => new Blob(['%PDF-1.7 local bytes'], { type: 'application/pdf' });
beforeEach(() => {
  vi.resetAllMocks();
  pdf.destroy.mockResolvedValue(undefined);
  pdf.render.mockReturnValue({ promise: Promise.resolve(), cancel: pdf.cancel });
  pdf.viewport.mockImplementation(({ scale }: { scale: number }) => ({ width: 1200 * scale, height: 1800 * scale }));
  pdf.getPage.mockResolvedValue({ getViewport: pdf.viewport, render: pdf.render });
  pdf.getDocument.mockReturnValue({ promise: Promise.resolve({ numPages: 4, getPage: pdf.getPage }), destroy: pdf.destroy });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(jpeg);
});
afterEach(() => vi.restoreAllMocks());
describe('Visione PDF locale: una pagina, nessun file originale', () => {
  it('renderizza soltanto la pagina scelta in JPEG limitato e distrugge il task', async () => {
    const result = await prepareQuoteVision(file(), id, 3, new AbortController().signal);
    expect(result).toEqual({ attachmentId: id, page: 3, dataUrl: jpeg });
    expect(pdf.getPage).toHaveBeenCalledExactlyOnceWith(3);
    expect(pdf.render).toHaveBeenCalledOnce();
    expect(pdf.getDocument.mock.calls[0][0]).toMatchObject({ isEvalSupported: false, data: expect.any(Uint8Array) });
    expect(pdf.destroy).toHaveBeenCalledOnce();
    expect(result.dataUrl).not.toContain('application/pdf');
  });
  it('rifiuta una pagina assente senza renderizzare', async () => {
    await expect(prepareQuoteVision(file(), id, 5, new AbortController().signal)).rejects.toThrow('non esiste');
    expect(pdf.getPage).not.toHaveBeenCalled(); expect(pdf.destroy).toHaveBeenCalledOnce();
  });
  it('blocca un’immagine troppo pesante invece di inviare il PDF', async () => {
    vi.mocked(HTMLCanvasElement.prototype.toDataURL).mockReturnValue('data:image/jpeg;base64,' + 'x'.repeat(180001));
    await expect(prepareQuoteVision(file(), id, 1, new AbortController().signal)).rejects.toThrow('troppo pesante');
    expect(pdf.destroy).toHaveBeenCalledOnce();
  });
  it('annullamento prima della lettura: nessun motore PDF', async () => {
    const ctrl = new AbortController(); ctrl.abort();
    await expect(prepareQuoteVision(file(), id, 1, ctrl.signal)).rejects.toThrow();
    expect(pdf.getDocument).not.toHaveBeenCalled();
  });
  it('annulla un rendering avviato e libera il documento locale', async () => {
    const ctrl = new AbortController();
    pdf.render.mockImplementation(() => {
      const promise = new Promise<void>((_, reject) => pdf.cancel.mockImplementation(() => reject(new Error('Rendering annullato'))));
      queueMicrotask(() => ctrl.abort());
      return { promise, cancel: pdf.cancel };
    });
    await expect(prepareQuoteVision(file(), id, 2, ctrl.signal)).rejects.toThrow('annullato');
    expect(pdf.cancel).toHaveBeenCalledOnce(); expect(pdf.destroy).toHaveBeenCalled();
    expect(HTMLCanvasElement.prototype.toDataURL).not.toHaveBeenCalled();
  });
  it.each([0, 21, 1.5])('rifiuta la pagina fuori contratto %s', async page => {
    await expect(prepareQuoteVision(file(), id, page, new AbortController().signal)).rejects.toThrow('limiti');
    expect(pdf.getDocument).not.toHaveBeenCalled();
  });
});
