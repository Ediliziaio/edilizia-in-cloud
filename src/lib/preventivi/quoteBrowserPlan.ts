import { PLAN_MAX_BYTES, type PlanReading, type PlanText } from './planReading';
import { localImageDimensions } from './quoteVision';

/** Local PDF text extraction, not OCR. Scans/images need an explicit vision
 * action; attaching never sends the original or triggers a paid AI call.
 */
export async function readPlanInBrowser(blob: Blob, page: number, signal: AbortSignal): Promise<PlanReading> {
  signal.throwIfAborted();
  if (!blob.size || blob.size > PLAN_MAX_BYTES || !Number.isInteger(page) || page < 1 || page > 20) throw new Error('File o pagina oltre i limiti.');
  const head = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  const pdf = new TextDecoder().decode(head.slice(0, 5)) === '%PDF-';
  if (!pdf) {
    const png = [137,80,78,71,13,10,26,10].every((v,i) => head[i] === v);
    const jpeg = head[0] === 255 && head[1] === 216 && head[2] === 255;
    if ((!png && !jpeg) || page !== 1) throw new Error('Usa PNG, JPEG o PDF non protetto.');
    const dimensions = await localImageDimensions(new Blob([blob], {type: png ? 'image/png' : 'image/jpeg'}), signal);
    const scale = Math.min(1, 4800 / Math.max(dimensions.width, dimensions.height));
    return {version:1, engine:'Immagine nel browser', page:1, pages:1, width:Math.max(1,Math.round(dimensions.width*scale)), height:Math.max(1,Math.round(dimensions.height*scale)), lines:[]};
  }
  const [{getDocument, GlobalWorkerOptions}, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
  signal.throwIfAborted(); GlobalWorkerOptions.workerSrc = worker.default;
  // PDF.js 6 removed the old isEvalSupported option. We only read page text;
  // no viewer, document actions or JavaScript execution is instantiated.
  const task = getDocument({data:new Uint8Array(await blob.arrayBuffer()), disableAutoFetch:true});
  const abort = () => { void task.destroy(); };
  signal.addEventListener('abort', abort, {once:true});
  try {
    signal.throwIfAborted();
    const document = await task.promise;
    if (document.numPages > 20 || page > document.numPages) throw new Error('Massimo 20 pagine; seleziona una pagina esistente.');
    const selected = await document.getPage(page); const viewport = selected.getViewport({scale:1});
    if (!viewport.width || !viewport.height || !Number.isFinite(viewport.width * viewport.height)) throw new Error('Dimensioni PDF non valide.');
    const stream = selected.streamTextContent({disableNormalization:false}); const reader = stream.getReader();
    const cancel = () => { void reader.cancel().catch(() => {}); }; signal.addEventListener('abort', cancel, {once:true});
    const lines:PlanText[] = []; let inspected = 0;
    try {
      while (lines.length < 500 && inspected < 5000) {
        signal.throwIfAborted(); const {done,value} = await reader.read(); if(done) break;
        for (const item of value.items) {
          inspected++; if (!('str' in item) || !item.str.trim()) continue;
          const [x,y] = viewport.convertToViewportPoint(item.transform[4],item.transform[5]);
          const left = Math.max(0,Math.min(1,x/viewport.width));
          const top = Math.max(0,Math.min(1,(y-Math.abs(item.height))/viewport.height));
          const width = Math.max(0,Math.min(1-left,Math.abs(item.width)/viewport.width));
          const height = Math.max(0,Math.min(1-top,Math.abs(item.height)/viewport.height));
          lines.push({text:item.str.slice(0,500), confidence:1, bbox:[left,top,width,height]});
          if(lines.length >= 500 || inspected >= 5000) break;
        }
      }
    } finally {signal.removeEventListener('abort',cancel); await reader.cancel().catch(() => {}); reader.releaseLock();}
    signal.throwIfAborted(); const scale = Math.min(1,4800/Math.max(viewport.width,viewport.height));
    return {version:1,engine:'Testo PDF nel browser',page,pages:document.numPages,width:Math.max(1,Math.ceil(viewport.width*scale)),height:Math.max(1,Math.ceil(viewport.height*scale)),lines};
  } finally {signal.removeEventListener('abort',abort);await task.destroy();}
}
