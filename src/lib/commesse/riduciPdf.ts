/**
 * PDF scansionati più leggeri prima del caricamento.
 *
 * Una scansione (CamScanner, fotocopiatrice) è una foto per pagina, spesso a
 * 300-600 dpi: 2-5 MB per poche pagine. Si ridisegna ogni pagina a ~150 dpi
 * in JPEG e si ricompone il PDF con le stesse dimensioni: resta leggibile e
 * stampabile, pesa un terzo o meno.
 *
 * Si tocca SOLO un PDF senza testo selezionabile (documenti generati da un
 * programma: preventivi, fatture, contratti digitali restano identici) e solo
 * se il risultato pesa almeno il 30% in meno. Qualunque errore → originale.
 */
import type { EsitoRiduzione } from "./riduciFoto";

export const SOGLIA_PDF_BYTE = 1024 * 1024;
const MAX_PAGINE = 40;
const MAX_BYTE = 40 * 1024 * 1024;
const DPI = 150;
const LATO_MAX_PX = 2000;
const QUALITA = 0.72;
/** Oltre questo tempo si carica l'originale: chi carica non deve aspettare. */
const TEMPO_MAX_MS = 20_000;

export function pdfDaValutare(file: { name: string; type: string; size: number }): boolean {
  const pdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  return pdf && file.size >= SOGLIA_PDF_BYTE && file.size <= MAX_BYTE;
}

/** Scala di render: 150 dpi, ma mai oltre 2000 px sul lato lungo. */
export function scalaRender(larghezzaPt: number, altezzaPt: number): number {
  const scala = DPI / 72;
  const lato = Math.max(larghezzaPt, altezzaPt) * scala;
  return lato > LATO_MAX_PX ? LATO_MAX_PX / Math.max(larghezzaPt, altezzaPt) : scala;
}

async function pdfjs() {
  const lib = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  if (typeof worker === "string" && !lib.GlobalWorkerOptions.workerSrc) lib.GlobalWorkerOptions.workerSrc = worker;
  return lib;
}

export async function riduciPdfScansionato(file: File): Promise<EsitoRiduzione> {
  const originale: EsitoRiduzione = { file, ridotta: false, byteOriginali: file.size };
  if (!pdfDaValutare(file) || typeof document === "undefined") return originale;
  try {
    const lib = await pdfjs();
    const byte = new Uint8Array(await file.arrayBuffer());
    const doc = await lib.getDocument({ data: byte.slice() }).promise;
    if (doc.numPages > MAX_PAGINE) { void doc.loadingTask.destroy(); return originale; }

    const { PDFDocument } = await import("pdf-lib");
    const nuovo = await PDFDocument.create();
    const inizio = performance.now();

    for (let i = 1; i <= doc.numPages; i++) {
      if (performance.now() - inizio > TEMPO_MAX_MS) { void doc.loadingTask.destroy(); return originale; }
      const pagina = await doc.getPage(i);
      // Testo selezionabile = PDF generato da un programma: non si tocca.
      const testo = await pagina.getTextContent();
      const caratteri = testo.items.reduce((t, it) => t + ("str" in it ? it.str.trim().length : 0), 0);
      if (caratteri > 40) { void doc.loadingTask.destroy(); return originale; }

      const base = pagina.getViewport({ scale: 1 });
      const viewport = pagina.getViewport({ scale: scalaRender(base.width, base.height) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) { void doc.loadingTask.destroy(); return originale; }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await pagina.render({ canvasContext: ctx, viewport, canvas }).promise;
      const jpeg = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", QUALITA));
      if (!jpeg) { void doc.loadingTask.destroy(); return originale; }
      const immagine = await nuovo.embedJpg(new Uint8Array(await jpeg.arrayBuffer()));
      const p = nuovo.addPage([base.width, base.height]);
      p.drawImage(immagine, { x: 0, y: 0, width: base.width, height: base.height });
      canvas.width = 0; canvas.height = 0; // libera la memoria subito
    }
    void doc.loadingTask.destroy();

    const risultato = await nuovo.save();
    if (risultato.byteLength > file.size * 0.7) return originale;
    return {
      file: new File(
        [risultato.buffer.slice(risultato.byteOffset, risultato.byteOffset + risultato.byteLength) as ArrayBuffer],
        file.name,
        { type: "application/pdf", lastModified: file.lastModified },
      ),
      ridotta: true,
      byteOriginali: file.size,
    };
  } catch {
    return originale;
  }
}
