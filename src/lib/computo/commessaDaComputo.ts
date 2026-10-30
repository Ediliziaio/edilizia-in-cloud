/**
 * Dal preventivo con computo alla commessa (29/10/2026). La commessa nuova si
 * precompila da un preventivo (`CreateOrder?quote_id=`, `useQuotePrefill`):
 * cliente, righe e rate. Il computo ha già la sua riga in `quotes` (la stessa
 * della firma online, `modulo:computo:<bozza>`); qui la si prepara se manca e
 * le si danno le voci del computo come `quote_items` e il piano dei pagamenti
 * come `payment_phases`. Poi si apre la commessa, da rivedere prima di salvare.
 *
 * Un preventivo già firmato non si riscrive: il firmato è il contratto. Se le
 * sue righe ci sono già si usano quelle; se mancano (firmato prima di questa
 * funzione) si scrivono una volta sola, da questo computo.
 */
import { supabase } from "@/integrations/supabase/client";
import { getModuleQuote, upsertModuleQuote } from "@/lib/moduli/quoteBridge";
import { esitoOffertaModulo } from "@/lib/moduli/esitoOffertaModulo";
import { calcolaVoce, numeroEditor, type BozzaComputo } from "./editorNativo";

export const MODULO_COMPUTO = "computo";

export type DatiCommessaComputo = {
  companyId: string; userId: string; draftId: string;
  /** Le voci del documento: senza opzionali e senza capitoli spenti. */
  bozza: BozzaComputo;
  subtotal: number; vatAmount: number; total: number; aliquotaIva: number | null;
  rate: { descrizione: string; percentuale: number; importo: number }[];
  validityDays: number;
  /** Chi vede i costi: il costo stimato diventa il prezzo d'acquisto della riga. */
  conCosti: boolean;
  generaPdf: () => Promise<Blob>;
};

/**
 * Le righe del preventivo dalle voci del computo: una riga per voce, prezzi già scontati di riga a zero.
 * Il costo della voce, se manca, lo prende il database dal listino aziendale col codice (`codice_prezzario`).
 */
export function righeDaComputo(d: Pick<DatiCommessaComputo, "bozza" | "aliquotaIva" | "conCosti" | "companyId">, quoteId: string) {
  return d.bozza.voci.map((v, k) => {
    const c = calcolaVoce(v);
    const [nome, ...resto] = v.descrizione.trim().split("\n");
    const costo = d.conCosti ? numeroEditor(v.costo ?? "") : null;
    return {
      quote_id: quoteId, company_id: d.companyId, item_type: "service", item_category: "posa",
      name: (nome || "Lavorazione").slice(0, 500), description: resto.join("\n").trim() || null,
      quantity: c.quantita ?? 0, unit_price: c.prezzo ?? 0, unit_of_measure: v.unita || null, vat_rate: d.aliquotaIva,
      discount_percent: 0, sort_order: k, is_optional: false, mostra_nel_pdf: true,
      codice_prezzario: v.tariffa.trim() || null, prezzo_acquisto: costo,
      // Il capitolo fa la fase della commessa, la voce la sua sottofase (crea_commessa_preventivo_atomic, 31/10/2026).
      custom_field_values: { computo: { capitolo: v.capitolo.trim() || "Lavorazioni" } },
    };
  });
}

/** Le rate del piano come fasi di pagamento del preventivo: l'ultima è il saldo. */
export function fasiDaRate(rate: DatiCommessaComputo["rate"]) {
  return rate.map((r, k) => ({ label: r.descrizione, type: k === rate.length - 1 && rate.length > 1 ? "balance" : "deposit", percent: r.percentuale, amount: r.importo }));
}

export async function preparaCommessaDaComputo(d: DatiCommessaComputo): Promise<string> {
  const esistente = await getModuleQuote(d.companyId, MODULO_COMPUTO, d.draftId);
  const deciso = !!esitoOffertaModulo(esistente);
  const riga = deciso ? esistente! : await upsertModuleQuote({
    companyId: d.companyId, userId: d.userId, moduleKey: MODULO_COMPUTO, progettoId: d.draftId,
    titolo: d.bozza.titolo.trim() || "Preventivo con computo", clientName: d.bozza.committente.trim() || "Cliente",
    clientEmail: d.bozza.clienteEmail || null, clientPhone: d.bozza.clienteTelefono || null,
    subtotal: d.subtotal, vatAmount: d.vatAmount, total: d.total, validityDays: d.validityDays, pdfBlob: await d.generaPdf(),
  });
  const { count, error: erroreConta } = await supabase.from("quote_items").select("id", { count: "exact", head: true }).eq("quote_id", riga.id);
  if (erroreConta) throw new Error("Non riesco a leggere le righe del preventivo: riprova.");
  if (deciso && (count ?? 0) > 0) return riga.id;
  if (!deciso && (count ?? 0) > 0) {
    const { error } = await supabase.from("quote_items").delete().eq("quote_id", riga.id);
    if (error) throw new Error("Non riesco ad aggiornare le righe del preventivo: riprova.");
  }
  const righe = righeDaComputo(d, riga.id);
  if (righe.length) {
    const { error } = await supabase.from("quote_items").insert(righe as never);
    if (error) throw new Error(`Righe del preventivo non salvate: ${error.message}`);
  }
  if (!deciso) {
    const patch: Record<string, unknown> = { payment_phases: fasiDaRate(d.rate) };
    if (d.bozza.clienteId) patch.contact_id = d.bozza.clienteId;
    if (d.bozza.indirizzo.trim()) patch.client_address = d.bozza.indirizzo.trim();
    // I dati fiscali del cliente passano alla commessa e poi alla fattura (30/10/2026).
    const cf = d.bozza.clienteCodiceFiscale?.replace(/\s+/g, "").toUpperCase(), piva = d.bozza.clientePartitaIva?.replace(/\s+/g, "").toUpperCase().replace(/^IT/, "");
    if (cf) patch.client_fiscal_code = cf;
    if (d.bozza.clienteTipo === "azienda" || d.bozza.clienteTipo === "pa") {
      if (piva) patch.client_vat_number = piva;
      if (d.bozza.committente.trim()) patch.client_company = d.bozza.committente.trim();
    }
    const { error } = await supabase.from("quotes").update(patch as never).eq("id", riga.id);
    if (error) throw new Error(`Rate e cliente non salvati sul preventivo: ${error.message}`);
  }
  return riga.id;
}
