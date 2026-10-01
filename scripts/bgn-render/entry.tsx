// Render del MODELLO BAGNO VERO (@react-pdf, DocumentoEdilePDF) dai dati di un
// preventivo (quotes + quote_items) e dal template estetico dell'azienda
// (bgn_template_pdf). Bundlato per Deno (edge). L'adattatore ricostruisce i
// capitoli del computo (persi quando le sezioni sono state appiattite in voci).

import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { enrichBagniPdf } from "@/hooks/useBagniPDF";
import { BagniPDF } from "@/components/bagni/BagniPDF";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export interface QuoteItem {
  name?: string | null; description?: string | null; quantity?: number | null;
  unit_price?: number | null; unit_of_measure?: string | null; item_type?: string | null;
}
export interface RenderInput {
  quote: { id?: string | null; quote_number?: string | null; client_name?: string | null; subtotal?: number | null; vat_amount?: number | null; total?: number | null; indirizzo_lavori?: string | null };
  items: QuoteItem[];
  template: Record<string, Any>;
  company: { name?: string | null } | null;
}

// Ricostruzione del capitolo dalla descrizione della voce (le sezioni originali
// del computo non sono salvate sulla quote). Ordine dei capitoli come in cantiere.
const CAPITOLI: Array<{ nome: string; re: RegExp }> = [
  { nome: "Preparazioni", re: /trasport|prepar|protezion|cantiere|allestiment/i },
  { nome: "Rimozioni", re: /rimozion|demolizion|smontagg|smaltiment/i },
  { nome: "Impianti", re: /impiant|idraulic|elettric|tubazion|scarico|punti luce|prese/i },
  { nome: "Opere murarie", re: /massett|intonac|traccia|tracce|rasatur|sottofond|muratur/i },
  { nome: "Finiture", re: /rivestiment|paviment|gres|posa|impermeabil|tinteggiatur|ceramic/i },
  { nome: "Dotazioni", re: /sanitari|wc|bidet|lavabo|mobile|doccia|box|piatto|miscelator|rubinett|termoarred|cassetta|specchio|gruppo|soffione|scaldasalviette/i },
];
function capitoloDi(descr: string): { nome: string; ord: number } {
  for (let i = 0; i < CAPITOLI.length; i++) if (CAPITOLI[i].re.test(descr)) return { nome: CAPITOLI[i].nome, ord: i };
  return { nome: "Lavori", ord: CAPITOLI.length };
}

export async function renderBagnoReale(input: RenderInput): Promise<Uint8Array> {
  const { quote, items, template, company } = input;
  const iva = Number(template?.default_iva_pct ?? 22);
  const detr = Number(template?.default_detrazione_pct ?? 0);

  // Voci del computo con capitolo ricostruito, ordinate per capitolo poi per arrivo.
  const conCap = items.map((it, i) => {
    const descr = String(it.description ?? it.name ?? "").trim();
    const cap = capitoloDi(descr);
    const q = Number(it.quantity) || 1;
    const p = Number(it.unit_price) || 0;
    return { cap, descr, q, p, um: String(it.unit_of_measure ?? "corpo"), i };
  }).sort((a, b) => a.cap.ord - b.cap.ord || a.i - b.i);

  const computo = conCap.map((r, ordine) => ({
    id: `q-${ordine}`, progetto_id: quote.id ?? "quote", company_id: (company as Any)?.id ?? "",
    capitolo_nome: r.cap.nome, descrizione: r.descr, unita_misura: r.um as Any,
    quantita: r.q, prezzo_unitario: r.p, costo_materiali: 0, costo_manodopera: 0,
    sconto_pct: 0, importo: Math.round(r.q * r.p * 100) / 100, margine_eur: 0, margine_pct: 0,
    listino_voce_id: null, ordine, fonte: null,
  }));

  const [nome, ...cognome] = String(quote.client_name ?? "").trim().split(/\s+/);
  const progetto = {
    modello_snapshot: null,
    id: quote.id ?? "quote", company_id: (company as Any)?.id ?? "", code: quote.quote_number ?? null,
    stato: "bozza", tipo_intervento: "completo", numero_bagni: 1,
    cliente_nome: nome || (quote.client_name ?? null), cliente_cognome: cognome.join(" ") || null,
    cliente_email: null, cliente_telefono: null,
    cantiere_indirizzo: quote.indirizzo_lavori ?? null, cantiere_citta: null, cantiere_provincia: null, cantiere_cap: null,
    immobile_tipo: null, immobile_superficie_mq: null, immobile_anno: null, immobile_piani: null,
    perimetro_ml: null, altezza_rivestimento_m: null, accessibile: false, massimale_detrazione: null,
    opportunita_id: null, cliente_id: null, template_id: null,
    sconto_pct: 0, iva_pct: iva, detrazione_pct: detr,
    totale_imponibile: Number(quote.subtotal) || 0, totale: Number(quote.total) || 0,
    note: null, created_by: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    mostra_finanziamento: false, deleted_at: null, updated_by: null, prezzo_manuale: null,
  };

  const enriched = await enrichBagniPdf({
    progetto: progetto as Any, computo: computo as Any, media: [], template: template as Any,
    company: { name: company?.name ?? "" } as Any,
  } as Any);
  const buf = await renderToBuffer(<BagniPDF {...(enriched as Any)} />);
  return new Uint8Array(buf);
}
