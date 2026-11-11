/**
 * Schede tecniche nel PDF del preventivo fotovoltaico.
 *
 * Il PDF del FV è la stampa nativa del browser di un HTML (fedeltà 1:1 con
 * l'anteprima). La stampa nativa non sa unire PDF esterni, quindi le schede
 * tecniche AUTORIZZATE dei prodotti usati vengono rese pagina-per-pagina come
 * immagini ad alta risoluzione (pdfjs) e inserite come PAGINE A4 INTERE
 * nell'HTML, subito PRIMA delle condizioni contrattuali. Nessun ridimensionamento:
 * ogni scheda occupa una pagina intera (object-fit: contain, rapporto invariato).
 *
 * Lavora sull'HTML già salvato: non serve rigenerare il preventivo lato edge.
 */
import { supabase } from "@/integrations/supabase/client";
import { selezionaSchedeProdottoFv } from "../../../supabase/functions/_shared/fvDocumentiProdotto";

// Tabella nuova: non ancora nei tipi generati.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Ogni pagina di un PDF (dall'URL) → dataURL JPEG ad alta risoluzione. */
async function pdfUrlToImmagini(url: string, scale = 2): Promise<string[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Scheda non raggiungibile (${res.status})`);
  const buf = await res.arrayBuffer();
  const pdfjsLib = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  const caricamento = pdfjsLib.getDocument({ data: buf });
  const out: string[] = [];
  try {
    const pdf = await caricamento.promise;
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Impossibile preparare le pagine della scheda tecnica.");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      try {
        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
        out.push(canvas.toDataURL("image/jpeg", 0.9));
      } finally { canvas.width = 0; canvas.height = 0; }
    }
    if (!out.length) throw new Error("La scheda tecnica non contiene pagine.");
    return out;
  } finally { await caricamento.destroy(); }
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Le pagine HTML (A4 intere) delle schede tecniche AUTORIZZATE dei prodotti
 * usati nel preventivo. Stringa vuota se non ce ne sono. Una scheda autorizzata illeggibile
 * ferma lo scaricamento: il cliente non deve ricevere un allegato incompleto.
 */
export async function leggiSchedeTecnichePreventivo(articoloIds: Array<string | null | undefined>, companyId: string): Promise<ReturnType<typeof selezionaSchedeProdottoFv>> {
  const ids = Array.from(new Set(articoloIds.filter((x): x is string => !!x)));
  if (ids.length === 0) return [];

  if (!companyId) throw new Error("Azienda del preventivo non disponibile.");
  const [nuove, legacy] = await Promise.all([
    db.from("articoli_native_documenti")
      .select("nome, url, ordine, articolo_id, autorizzata")
      .eq("company_id", companyId).in("articolo_id", ids)
      .order("ordine", { ascending: true }).order("created_at", { ascending: true }),
    db.from("articoli_native")
      .select("id, scheda_tecnica_url").eq("company_id", companyId).in("id", ids),
  ]);
  if (nuove.error || legacy.error) throw new Error("Impossibile verificare gli allegati tecnici dei prodotti. Riprova prima di scaricare.");
  return selezionaSchedeProdottoFv(ids, nuove.data ?? [], legacy.data ?? []);
}

export async function costruisciPagineSchedeTecniche(articoloIds: Array<string | null | undefined>, companyId: string): Promise<string> {
  const schede = await leggiSchedeTecnichePreventivo(articoloIds, companyId);
  if (schede.length === 0) return "";

  const pagine: string[] = [];
  for (const s of schede) {
    try {
      const immagini = await pdfUrlToImmagini(s.url);
      for (const img of immagini) {
        pagine.push(
          `<div class="page" style="display:flex;align-items:center;justify-content:center;padding:0;">` +
            `<img src="${img}" style="max-width:100%;max-height:100%;object-fit:contain;display:block;" alt="${escapeAttr(s.nome)}"/>` +
            `</div>`,
        );
      }
    } catch {
      throw new Error(`Scheda tecnica «${s.nome}» non disponibile. Riprova oppure verifica il PDF e l’opzione Allega nel prodotto.`);
    }
  }
  return pagine.join("");
}

/**
 * Inserisce le pagine delle schede PRIMA delle condizioni contrattuali (o, in
 * mancanza, prima della firma / del recesso / della fine del documento). Ancore
 * sul testo dell'HTML già generato: non serve rigenerare il preventivo.
 */
export function inserisciPagineSchede(html: string, pagineSchede: string): string {
  if (!pagineSchede) return html;
  for (const sezione of ["condizioni", "firma", "recesso"]) {
    const idx = html.indexOf(`data-fv-section="${sezione}"`);
    const start = idx < 0 ? -1 : html.lastIndexOf('<div class="page"', idx);
    if (start >= 0) return html.slice(0, start) + pagineSchede + html.slice(start);
  }
  const ancore = ["Condizioni generali di contratto", "Per accettazione", "Modulo di recesso", "Diritto di recesso"];
  for (const a of ancore) {
    const idx = html.indexOf(a);
    if (idx === -1) continue;
    const start = html.lastIndexOf('<div class="page"', idx);
    if (start === -1) continue;
    return html.slice(0, start) + pagineSchede + html.slice(start);
  }
  const bodyEnd = html.lastIndexOf("</body>");
  if (bodyEnd !== -1) return html.slice(0, bodyEnd) + pagineSchede + html.slice(bodyEnd);
  return html + pagineSchede;
}
