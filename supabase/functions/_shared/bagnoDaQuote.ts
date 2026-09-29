// Dal preventivo (quotes + quote_items) al progetto bagno (bgn_progetti +
// bgn_computo_voci), così l'app può aprire il MODELLO VERO da un link e farne
// scaricare/firmare il PDF. (29/09/2026) Ricostruisce i capitoli persi
// nell'appiattimento delle voci del computo.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export interface QuoteItemLike {
  name?: string | null; description?: string | null; quantity?: number | null;
  unit_price?: number | null; unit_of_measure?: string | null; item_type?: string | null;
}

const CAPITOLI: Array<{ nome: string; re: RegExp }> = [
  { nome: "Preparazioni", re: /trasport|prepar|protezion|cantiere|allestiment/i },
  { nome: "Rimozioni", re: /rimozion|demolizion|smontagg|smaltiment/i },
  { nome: "Impianti", re: /impiant|idraulic|elettric|tubazion|scarico|punti luce|prese/i },
  { nome: "Opere murarie", re: /massett|intonac|traccia|tracce|rasatur|sottofond|muratur/i },
  { nome: "Finiture", re: /rivestiment|paviment|gres|posa|impermeabil|tinteggiatur|ceramic/i },
  { nome: "Dotazioni", re: /sanitari|wc|bidet|lavabo|mobile|doccia|box|piatto|miscelator|rubinett|termoarred|cassetta|specchio|gruppo|soffione|scaldasalviette/i },
];
export function capitoloDi(descr: string): { nome: string; ord: number } {
  for (let i = 0; i < CAPITOLI.length; i++) if (CAPITOLI[i].re.test(descr)) return { nome: CAPITOLI[i].nome, ord: i };
  return { nome: "Lavori", ord: CAPITOLI.length };
}

// L'app usa unità di misura sue: mappo quelle del preventivo su valori sicuri.
function unitaMap(u: string | null | undefined): string {
  const s = String(u ?? "").toLowerCase().trim();
  if (s === "fisso" || s === "" || s === "corpo" || s === "a corpo") return "corpo";
  if (s === "pz" || s === "pezzo" || s === "cad" || s === "n") return "cad";
  if (s === "mq" || s === "m2" || s === "m²") return "mq";
  if (s === "ml" || s === "m") return "ml";
  if (s === "h" || s === "ora" || s === "ore") return "ora";
  return "corpo";
}

/** Righe bgn_computo_voci (senza progetto_id: lo mette il chiamante) ordinate per capitolo. */
export function vociDaQuote(items: QuoteItemLike[], companyId: string): Array<Record<string, Any>> {
  const conCap = (items ?? []).map((it, i) => {
    const descr = String(it.description ?? it.name ?? "").trim();
    const q = Number(it.quantity) || 1;
    const p = Number(it.unit_price) || 0;
    return { cap: capitoloDi(descr), descr, q, p, um: unitaMap(it.unit_of_measure), i };
  }).sort((a, b) => a.cap.ord - b.cap.ord || a.i - b.i);

  return conCap.map((r, ordine) => ({
    company_id: companyId, capitolo_nome: r.cap.nome, descrizione: r.descr, unita_misura: r.um,
    quantita: r.q, prezzo_unitario: r.p, costo_materiali: 0, costo_manodopera: 0, sconto_pct: 0,
    importo: Math.round(r.q * r.p * 100) / 100, margine_eur: 0, margine_pct: 0, listino_voce_id: null, fonte: null, ordine,
  }));
}

function arrotonda2(n: number): number { return Math.round(n * 100) / 100; }

/** Campi bgn_progetti (senza id/code) dal preventivo e dal template.
 *
 * IVA e sconto si RICAVANO dai numeri del preventivo, non dal template: la
 * pagina PDF ricalcola il totale dalle voci con l'iva_pct/sconto_pct del
 * progetto, quindi devono riprodurre esattamente il totale che il titolare già
 * conosce (es. 7.086 → 8.644,92 = IVA 22%). Modello standard del preventivo:
 *   imponibile_scontato = subtotal − sconto ; iva = imponibile_scontato × iva% ;
 *   totale = imponibile_scontato + iva. */
export function progettoDaQuote(quote: Any, template: Any, companyId: string, userId: string | null): Record<string, Any> {
  const [nome, ...cognome] = String(quote?.client_name ?? "").trim().split(/\s+/);
  const subtotal = Number(quote?.subtotal) || 0;
  const sconto = Number(quote?.discount_amount) || 0;
  const vat = Number(quote?.vat_amount) || 0;
  const totale = Number(quote?.total) || 0;
  const imponibileScontato = subtotal - sconto;

  const scontoPct = subtotal > 0 && sconto > 0 ? arrotonda2((sconto / subtotal) * 100) : 0;
  // IVA: da vat_amount se c'è, altrimenti dedotta dal totale; fallback al template.
  let ivaPct: number;
  if (imponibileScontato > 0 && vat > 0) ivaPct = arrotonda2((vat / imponibileScontato) * 100);
  else if (imponibileScontato > 0 && totale > 0) ivaPct = arrotonda2((totale / imponibileScontato - 1) * 100);
  else ivaPct = Number(template?.default_iva_pct ?? 22);
  if (!(ivaPct >= 0)) ivaPct = Number(template?.default_iva_pct ?? 22);

  return {
    company_id: companyId, stato: "bozza", tipo_intervento: "completo", numero_bagni: 1,
    cliente_nome: nome || (quote?.client_name ?? null), cliente_cognome: cognome.join(" ") || null,
    cantiere_indirizzo: quote?.indirizzo_lavori ?? null,
    sconto_pct: scontoPct, iva_pct: ivaPct, detrazione_pct: Number(template?.default_detrazione_pct ?? 0),
    totale_imponibile: imponibileScontato > 0 ? arrotonda2(imponibileScontato) : 0, totale: arrotonda2(totale),
    note: `Da preventivo ${quote?.quote_number ?? ""}`.trim(), created_by: userId,
  };
}
