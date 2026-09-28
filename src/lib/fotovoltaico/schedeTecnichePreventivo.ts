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

// Tabella nuova: non ancora nei tipi generati.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface SchedaDoc {
  nome: string;
  url: string;
  ordine: number;
  articolo_id: string;
}

interface SchedaRis {
  url: string;
  nome: string;
}

/** Ogni pagina di un PDF (dall'URL) → dataURL JPEG ad alta risoluzione. */
async function pdfUrlToImmagini(url: string, scale = 2): Promise<string[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Scheda non raggiungibile (${res.status})`);
  const buf = await res.arrayBuffer();
  const pdfjsLib = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const out: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    out.push(canvas.toDataURL("image/jpeg", 0.9));
    canvas.width = 0;
    canvas.height = 0;
  }
  return out;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Le pagine HTML (A4 intere) delle schede tecniche AUTORIZZATE dei prodotti
 * usati nel preventivo. Stringa vuota se non ce ne sono. Una scheda illeggibile
 * si salta: il resto del PDF esce comunque.
 */
export async function costruisciPagineSchedeTecniche(articoloIds: Array<string | null | undefined>): Promise<string> {
  const ids = Array.from(new Set(articoloIds.filter((x): x is string => !!x)));
  if (ids.length === 0) return "";

  // Le schede da allegare, per articolo, nell'ordine dei prodotti del preventivo.
  const perArticolo = new Map<string, SchedaRis[]>();
  for (const id of ids) perArticolo.set(id, []);

  // 1) Schede nuove AUTORIZZATE (tabella multi-scheda con toggle «Allega»).
  const { data: nuove } = await db
    .from("articoli_native_documenti")
    .select("nome, url, ordine, articolo_id")
    .in("articolo_id", ids)
    .eq("autorizzata", true)
    .order("ordine", { ascending: true })
    .order("created_at", { ascending: true });
  for (const d of (nuove ?? []) as SchedaDoc[]) {
    const arr = perArticolo.get(d.articolo_id);
    if (arr && d.url) arr.push({ url: d.url, nome: d.nome || "Scheda tecnica" });
  }

  // 2) Scheda LEGACY (campo singolo articoli_native.scheda_tecnica_url): allegata
  //    a mano prima del toggle → la trattiamo come autorizzata. Niente doppioni.
  const { data: legacy } = await db
    .from("articoli_native")
    .select("id, scheda_tecnica_url")
    .in("id", ids);
  for (const a of (legacy ?? []) as Array<{ id: string; scheda_tecnica_url: string | null }>) {
    const url = a.scheda_tecnica_url;
    const arr = perArticolo.get(a.id);
    if (url && arr && !arr.some((x) => x.url === url)) arr.push({ url, nome: "Scheda tecnica" });
  }

  // Raccolta in ordine prodotti, deduplicata globalmente per URL.
  const visti = new Set<string>();
  const schede: SchedaRis[] = [];
  for (const id of ids) {
    for (const s of perArticolo.get(id) ?? []) {
      if (visti.has(s.url)) continue;
      visti.add(s.url);
      schede.push(s);
    }
  }
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
      // scheda illeggibile: si salta, il resto del PDF esce comunque.
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
