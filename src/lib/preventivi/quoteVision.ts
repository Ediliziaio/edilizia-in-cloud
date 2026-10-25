import { readQuoteAdvanced, type QuoteVision } from '../../../supabase/functions/_shared/quoteAdvanced';
/** Some WebKit decoders reject createImageBitmap with a misleading "network
 * error" for a local PNG. Fall back to the same local image decoder as preview. */
async function decodeLocalImage(blob: Blob, signal: AbortSignal): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  try {
    const bitmap = await createImageBitmap(blob);
    if (signal.aborted) { bitmap.close(); signal.throwIfAborted(); }
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  } catch { signal.throwIfAborted(); }
  const url = URL.createObjectURL(blob); const image = new Image();
  let abort: () => void = () => {}; let timer: ReturnType<typeof setTimeout> | undefined;
  const close = () => { image.onload = null; image.onerror = null; signal.removeEventListener('abort', abort); clearTimeout(timer); image.removeAttribute('src'); URL.revokeObjectURL(url); };
  try {
    await new Promise<void>((resolve, reject) => {
      abort = () => reject(signal.reason ?? new DOMException('Lettura annullata', 'AbortError'));
      signal.addEventListener('abort', abort, { once: true });
      image.onload = () => resolve(); image.onerror = () => reject(new Error('Decodifica locale della planimetria non riuscita. Esporta una nuova copia PNG o JPEG; nessuna immagine inviata.'));
      timer = setTimeout(() => reject(new Error('Preparazione locale della planimetria oltre il tempo massimo. Nessuna immagine inviata.')), 10_000);
      image.src = url;
      if (signal.aborted) abort();
    });
    clearTimeout(timer); signal.removeEventListener('abort', abort); signal.throwIfAborted();
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close };
  } catch (error) { close(); throw error; }
}
/** A bounded, re-encoded copy strips EXIF; original stays in browser IndexedDB. */
export async function localImageDimensions(blob: Blob, signal: AbortSignal) {
  const decoded = await decodeLocalImage(blob, signal);
  try {
    if (!decoded.width || !decoded.height || decoded.width * decoded.height > 40_000_000) throw new Error('Immagine oltre il limite di 40 megapixel.');
    return { width: decoded.width, height: decoded.height };
  } finally { decoded.close(); }
}

export async function prepareQuoteVision(blob: Blob, attachmentId: string, page: number, signal: AbortSignal): Promise<QuoteVision> {
  if (!['image/jpeg', 'image/png', 'application/pdf'].includes(blob.type)) throw new Error('Usa PNG, JPEG o PDF per la lettura visiva.');
  if (!blob.size || blob.size > 12 * 1024 * 1024 || !Number.isSafeInteger(page) || page < 1 || page > 20) throw new Error('Pagina o dimensione allegato oltre i limiti.');
  signal.throwIfAborted();
  if (blob.type === 'application/pdf') return preparePdfPageVision(blob, attachmentId, page, signal);
  const bitmap = await decodeLocalImage(blob, signal);
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 40_000_000) throw new Error('Dimensioni immagine oltre i limiti della prova.');
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Preparazione immagine non disponibile.');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap.source, 0, 0, canvas.width, canvas.height);
    for (const quality of [.85, .72, .6]) {
      signal.throwIfAborted(); const dataUrl = canvas.toDataURL('image/jpeg', quality);
      if (dataUrl.length <= 180_000) return readQuoteAdvanced({ model: 'anthropic/claude-sonnet-5.5', mode: 'conversation', vision: { attachmentId, page, dataUrl } }).vision!;
    }
    throw new Error('Immagine troppo pesante: esporta una pagina più leggera mantenendo leggibili le quote.');
  } finally { bitmap.close(); }
}

/** PDF.js runs locally. Only the selected page is rasterized; no document
 * scripts, remote PDF URL or original file are sent to the model. */
async function preparePdfPageVision(blob: Blob, attachmentId: string, page: number, signal: AbortSignal): Promise<QuoteVision> {
  const [{ getDocument, GlobalWorkerOptions }, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
  signal.throwIfAborted(); GlobalWorkerOptions.workerSrc = worker.default;
  const pdfSource = { data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false };
  const task = getDocument(pdfSource);
  let rendering: { cancel: () => void } | undefined;
  const abort = () => { rendering?.cancel(); void task.destroy(); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    signal.throwIfAborted();
    const pdf = await task.promise; signal.throwIfAborted();
    if (page > pdf.numPages) throw new Error('La pagina scelta non esiste nel PDF.');
    const selected = await pdf.getPage(page); const original = selected.getViewport({ scale: 1 });
    if (!original.width || !original.height || !Number.isFinite(original.width * original.height)) throw new Error('Dimensioni della pagina non valide.');
    const viewport = selected.getViewport({ scale: Math.min(2, 1600 / Math.max(original.width, original.height)) });
    const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Preparazione della pagina PDF non disponibile.');
    const render = selected.render({ canvasContext: ctx, viewport, canvas }); rendering = render;
    await render.promise; signal.throwIfAborted();
    for (const quality of [.85, .72, .6]) {
      signal.throwIfAborted();
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      if (dataUrl.length <= 180_000) return readQuoteAdvanced({ model: 'anthropic/claude-sonnet-5.5', mode: 'conversation', vision: { attachmentId, page, dataUrl } }).vision!;
    }
    throw new Error('Pagina troppo pesante: usa un dettaglio leggibile. Nessuna immagine è stata inviata.');
  } finally { signal.removeEventListener('abort', abort); await task.destroy(); }
}
