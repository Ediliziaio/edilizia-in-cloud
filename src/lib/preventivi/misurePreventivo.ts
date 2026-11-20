import { z } from "zod";
import { arrotondaDecimale, calcolaVoce, ePercentuale, misuraSchema, quantitaMisura, type VoceEditor } from "@/lib/computo/editorNativo";
import type { QuoteItemPro } from "@/types/quoteItem";

export const misurePreventivoSchema = z.object({
  attive: z.boolean(), manuale: z.number().finite(), righe: z.array(misuraSchema).max(500),
  detrazione: z.boolean().optional(),
});
export type MisurePreventivo = z.infer<typeof misurePreventivoSchema>;

export function quantitaDaMisure(m: MisurePreventivo): number | null {
  if (!m.attive) return m.manuale;
  if (!m.righe.length) return null;
  const quantita = m.righe.map(quantitaMisura);
  if (quantita.some(q => q === null)) return null;
  const somma = arrotondaDecimale(quantita.reduce<number>((s, q) => s + q!, 0));
  // quote_items.quantity è numeric(10,2): si controlla qui, prima di inviare il preventivo.
  return Number.isFinite(somma) && Math.abs(somma) < 1e8 ? m.detrazione ? -Math.abs(somma) : somma : null;
}

/** Quantità manuale e misure rimangono entrambe, anche passando da una modalità all'altra. */
export function rigaConMisure(r: QuoteItemPro, m: MisurePreventivo): QuoteItemPro {
  return { ...r, misureComputo: m, quantity: quantitaDaMisure(m) ?? r.quantity };
}

/** Le pose legate seguono la quantità del prodotto; una posa con misure proprie conserva il suo calcolo. */
export function aggiornaMisurePreventivo(righe: QuoteItemPro[], index: number, misure: MisurePreventivo): QuoteItemPro[] {
  const originale = righe[index];
  if (!originale) return righe;
  const aggiornata = rigaConMisure(originale, misure);
  const rapporto = originale.quantity > 0 ? aggiornata.quantity / originale.quantity : 1;
  return righe.map((r, i) => i === index ? aggiornata
    : !r.misureComputo?.attive && ((originale.client_temp_id && r.parent_temp_id === originale.client_temp_id) || (originale.id && r.parent_item_id === originale.id))
      ? { ...r, quantity: Math.max(0, r.quantity * rapporto) } : r);
}

const num = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 6 });
export function testoMisure(r: Pick<QuoteItemPro, "misureComputo" | "unit_of_measure"> & Partial<Pick<QuoteItemPro, "item_category">>): string {
  const m = r.misureComputo;
  if (!m?.attive || !m.righe.length || ["nota", "subtotale", "sconto"].includes(r.item_category ?? "")) return "";
  return [m.detrazione ? "Misure e formule - si detraggono" : "Misure e formule", ...m.righe.map((v, i) => {
    const formula = v.formula.trim() || [v.parti, v.lunghezza, v.larghezza, v.altezza].filter(v => v.trim()).join(" × ");
    const q = quantitaMisura(v);
    return `${v.descrizione.trim() || `Misura ${i + 1}`}: ${formula} = ${q == null ? "da completare" : num(q)} ${r.unit_of_measure || ""}`.trim();
  })].join("\n");
}

/** Anche i lettori PDF e i collegamenti che non conoscono le misure ricevono il dettaglio leggibile. */
export function descrizioneConMisure(r: Pick<QuoteItemPro, "description" | "misureComputo" | "unit_of_measure"> & Partial<Pick<QuoteItemPro, "item_category">>): string {
  return [r.description ?? "", testoMisure(r)].filter(Boolean).join("\n\n");
}

const schemaSnapshot = z.object({
  posizione: z.number().int().nonnegative(), nome: z.string(), unita: z.string(), quantita: z.number().finite(),
  descrizioneSalvata: z.string(), descrizioneBase: z.string(), misure: misurePreventivoSchema,
});
type Snapshot = z.infer<typeof schemaSnapshot>;
const oggetto = (x: unknown): Record<string, unknown> => x && typeof x === "object" && !Array.isArray(x) ? x as Record<string, unknown> : {};

/** JSON della testata già disponibile: nessuna migrazione e nessun uso degli assi del configuratore. */
export function salvaMisurePreventivo(custom: unknown, righe: QuoteItemPro[]): Record<string, unknown> {
  const risultato = { ...oggetto(custom) };
  const snapshot: Snapshot[] = righe.flatMap((r, posizione) => r.misureComputo ? [{
    posizione, nome: r.name, unita: r.unit_of_measure ?? "", quantita: r.quantity, descrizioneSalvata: descrizioneConMisure(r),
    descrizioneBase: r.description ?? "", misure: r.misureComputo,
  }] : []);
  if (snapshot.length) risultato._misure_preventivo = snapshot;
  else delete risultato._misure_preventivo;
  return risultato;
}

/** Non ricollega misure a una riga modificata da un altro editor: il testo del documento resta intatto. */
export function rileggiMisurePreventivo<T extends QuoteItemPro>(r: T, posizione: number, custom: unknown): T {
  const raw = oggetto(custom)._misure_preventivo;
  if (!Array.isArray(raw)) return r;
  const trovato = raw.find(s => oggetto(s).posizione === posizione);
  const parsed = schemaSnapshot.safeParse(trovato);
  if (!parsed.success) return r;
  const s = parsed.data;
  if (r.name !== s.nome || arrotondaDecimale(r.quantity) !== arrotondaDecimale(s.quantita) || (r.unit_of_measure ?? "") !== s.unita || (r.description ?? "") !== s.descrizioneSalvata) return r;
  return { ...r, description: s.descrizioneBase, misureComputo: s.misure };
}

export function righeConMisureIncomplete(righe: QuoteItemPro[]): number {
  return righe.filter(r => !["nota", "subtotale", "sconto"].includes(r.item_category) && r.misureComputo?.attive && quantitaDaMisure(r.misureComputo) == null).length;
}

/** Il computo importato diventa un normale preventivo: gli stessi conti di IVA e sconto, senza un secondo archivio. */
export function righePreventivoDaComputo(voci: VoceEditor[], iva: number, ordine = 0): QuoteItemPro[] {
  return voci.map((v, k) => {
    const c = calcolaVoce(v), percentuale = ePercentuale(v.unita);
    const dettaglio = [v.capitolo && `Capitolo: ${v.capitolo}`, v.tariffa && `Codice: ${v.tariffa}`, v.noteMisure].filter(Boolean).join("\n");
    return {
      client_temp_id: crypto.randomUUID(), item_type: "service", item_category: "posa", name: v.descrizione.split("\n")[0] || "Lavorazione",
      description: [v.descrizione.split("\n").slice(1).join("\n"), dettaglio, percentuale && `${c.prezzo ?? 0}% di ${c.quantita ?? 0} €`].filter(Boolean).join("\n"),
      quantity: percentuale ? c.importo != null && c.importo < 0 ? -1 : 1 : c.quantita ?? 0, unit_price: percentuale ? Math.abs(c.importo ?? 0) : c.prezzo ?? 0,
      unit_of_measure: percentuale ? "corpo" : v.unita, discount_percent: 0, vat_rate: iva,
      sort_order: ordine + k, prezzo_acquisto: Number((v.costo || "").replace(",", ".")) || 0,
      mostra_nel_pdf: true, is_optional: v.opzionale || v.daQuantificare,
      ...(!percentuale && v.misure.length ? { misureComputo: { attive: true, manuale: c.quantita ?? 0, righe: v.misure, detrazione: v.detrazione } } : {}),
    };
  });
}
