import { pdfPositionedItems, type PdfTextItem } from "../../../supabase/functions/_shared/pdfExtraction";
import { eComputoPrimus, leggiComputoPrimus, type PdfPaginaPosizionata } from "./primusPdf";
import { leggiComputoXpwe, MESSAGGIO_DCF } from "./xpwe";
import { eFoglioDaConvertire, eFoglioXlsx, leggiComputoExcel, MESSAGGIO_XLS } from "./computoExcel";
import type { ComputoStrutturato } from "./computoStrutturato";

/**
 * Legge nel browser un computo: il PDF stampato da PriMus, l'XPWE o un foglio Excel.
 *
 * Gli stessi lettori della edge function `computo-ai-extract`, ma senza il
 * giro dal server: niente caricamento, niente AI, e soprattutto niente
 * appiattimento in `computo_voci_estratte`, che tiene solo la quantità totale
 * di ogni voce e perde le righe di misura.
 *
 * Un PDF che non viene da PriMus (o è una scansione) si rifiuta con un motivo:
 * leggerlo «al meglio» vorrebbe dire inventare colonne che non si vedono.
 */

const MAX_BYTE = 50 * 1024 * 1024;

/**
 * Un PDF che non è un computo di PriMus, o una scansione: qui non si legge, ma
 * l'estrazione con l'AI sì. Chi può usarla (il popup «Importa voci») lo
 * riconosce da questa classe; per gli altri resta un errore col suo motivo.
 */
export class PdfDaLeggereConAi extends Error {}

export const MESSAGGIO_PDF_PROTETTO = "Il PDF è protetto da password: aprilo, salvalo senza password e ricaricalo.";
const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

async function pagineDaPdf(dati: ArrayBuffer): Promise<PdfPaginaPosizionata[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  // In pdfjs 6 si distrugge il caricamento, non il documento (che non ha più `destroy`).
  const caricamento = pdfjs.getDocument({ data: dati });
  const pdf = await caricamento.promise.catch((e: unknown) => {
    if ((e as { name?: string })?.name === "PasswordException") throw new Error(MESSAGGIO_PDF_PROTETTO);
    throw new Error("Il PDF è danneggiato o non si apre: prova a stamparlo di nuovo in PDF.");
  });
  try {
    const pagine: PdfPaginaPosizionata[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const pagina = await pdf.getPage(n);
      const contenuto = await pagina.getTextContent();
      pagine.push({ page: n, items: pdfPositionedItems(contenuto.items as PdfTextItem[]) });
      pagina.cleanup();
    }
    return pagine;
  } finally {
    await caricamento.destroy();
  }
}

export async function leggiFileComputo(file: File): Promise<ComputoStrutturato> {
  if (file.size > MAX_BYTE) throw new Error("Il file supera i 50 MB.");
  const nome = file.name.toLowerCase();
  if (nome.endsWith(".dcf")) throw new Error(MESSAGGIO_DCF);
  if (nome.endsWith(".xpwe")) return leggiComputoXpwe(await file.arrayBuffer());
  if (eFoglioXlsx(nome) || file.type === MIME_XLSX) return leggiComputoExcel(await file.arrayBuffer());
  if (eFoglioDaConvertire(nome) || file.type === "application/vnd.ms-excel") throw new Error(MESSAGGIO_XLS);
  if (!nome.endsWith(".pdf") && file.type !== "application/pdf") {
    throw new Error("Si importano il PDF stampato da PriMus, il file .xpwe e il foglio Excel .xlsx.");
  }
  const pagine = await pagineDaPdf(await file.arrayBuffer());
  if (!pagine.some(p => p.items.length)) {
    throw new PdfDaLeggereConAi("Il PDF non contiene testo: è una scansione. Serve il PDF stampato da PriMus o il file .xpwe.");
  }
  if (!eComputoPrimus(pagine)) {
    throw new PdfDaLeggereConAi("Questo PDF non è un computo stampato da PriMus. Si importano i PDF di PriMus e i file .xpwe (in PriMus: File › Esporta › XPWE).");
  }
  return leggiComputoPrimus(pagine);
}
