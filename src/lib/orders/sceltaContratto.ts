/**
 * Cosa del contratto letto entra nella commessa (17/11/2026): ogni scheda della finestra ha la sua spunta
 * «Applica alla commessa». Quello che non si spunta si toglie dalla lettura prima di applicarla, così
 * chi riceve i dati (Nuova commessa, Leggi contratto sulla commessa) non deve sapere niente delle scelte.
 */
import type { ContractExtract } from "./contractExtract";
import { fasiOperativePerEstratto, pianoOperativoContratto } from "./pianoOperativoContratto";

export type ParteContratto = "importo" | "lavorazioni" | "articoli" | "pagamento" | "date" | "note" | "cliente";

export const ETICHETTA_PARTE: Record<ParteContratto, string> = {
  importo: "Importo", lavorazioni: "Lavorazioni", articoli: "Articoli", pagamento: "Pagamento", date: "Date",
  note: "Note e firma", cliente: "Cliente e lavori",
};

export const ORDINE_PARTI: ParteContratto[] = ["importo", "lavorazioni", "articoli", "pagamento", "date", "note", "cliente"];

/** Le parti che il documento ha davvero: le schede vuote non si mostrano. */
export function partiPresenti(e: ContractExtract): ParteContratto[] {
  const p: ParteContratto[] = [];
  if (e.importo_totale_eur != null || e.importo_totale_ivato_eur != null) p.push("importo");
  if (!e.lavorazioni_escluse && ((e.fasi_lavoro?.length ?? 0) > 0 || pianoOperativoContratto(e).fasi.length > 0)) p.push("lavorazioni");
  if (e.voci.length > 0 || (e.posizioni_allegato?.length ?? 0) > 0) p.push("articoli");
  if (e.fasi_pagamento.length > 0 || e.modalita_pagamento) p.push("pagamento");
  if (e.data_inizio_lavori || e.data_fine_lavori) p.push("date");
  if ((e.note_a_mano?.length ?? 0) > 0 || e.firma) p.push("note");
  p.push("cliente");
  return p;
}

/** La lettura con le sole parti scelte: le altre si svuotano, come se il documento non le avesse. */
export function soloLeParti(e: ContractExtract, scelte: ReadonlySet<ParteContratto>): ContractExtract {
  const r: ContractExtract = { ...e, cliente: { ...e.cliente } };
  r.riferimento_piano = pianoOperativoContratto(e).riferimento;
  if (!scelte.has("importo")) {
    r.importo_totale_eur = null; r.importo_totale_ivato_eur = null; r.iva_pct = null; r.sconto_globale_pct = null; r.altri_costi = [];
  }
  if (!scelte.has("lavorazioni")) { r.fasi_lavoro = []; r.lavorazioni_escluse = true; }
  else if (e.origine_lettura !== "computo") { r.fasi_lavoro = fasiOperativePerEstratto(pianoOperativoContratto(e)); r.lavorazioni_escluse = false; }
  if (!scelte.has("articoli")) { r.voci = []; r.posizioni_allegato = []; }
  if (!scelte.has("pagamento")) { r.fasi_pagamento = []; r.modalita_pagamento = null; }
  if (!scelte.has("date")) { r.data_inizio_lavori = null; r.data_fine_lavori = null; }
  if (!scelte.has("note")) { r.note_a_mano = []; r.firma = null; }
  if (!scelte.has("cliente")) {
    r.cliente = { nome_completo: "", email: null, telefono: null, indirizzo: null, codice_fiscale: null, partita_iva: null };
    r.indirizzo_cantiere = null;
  }
  return r;
}
