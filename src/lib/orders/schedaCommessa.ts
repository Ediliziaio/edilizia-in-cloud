// src/lib/orders/schedaCommessa.ts
//
// La scheda commessa arriva in una lettura sola (RPC scheda_commessa): qui ogni
// pezzo va nella memoria dell'app sotto la chiave del componente che lo usa,
// con la stessa forma che il componente si costruirebbe da solo. Così i
// componenti lo trovano pronto, e dopo una modifica rileggono solo il loro pezzo.
import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { pesoMediaValido } from "@/lib/orders/avanzamentoCommessa";
import { controlliValidi } from "@/lib/orders/nuovaCommessa";

type Riga = Record<string, unknown>;

export interface SchedaCommessa {
  stati: Riga[];
  fasi: { status: string; percentuale: number | null }[];
  storia: Riga[];
  allegati: Riga[];
  prossima_attivita: Riga | null;
  commessa: (Riga & { percentuale_avanzamento: number | null }) | null;
  impostazioni_fasi: { peso_media: unknown; modello_fasi_predefinito: string | null; controlli_avvio: unknown } | null;
  fatture_collegate: { id: string; importo_associato: number | null; fattura_id: string; company_id: string }[];
  fatture_dirette: (Riga & { id: string })[];
  fatture_da_collegamento: (Riga & { id: string })[];
  varianti: Riga[];
  rate: Riga[];
  materiali: Riga[];
  accessi: Riga[];
  manodopera_presente: boolean;
  ticket: Riga[] | null;
  rapportini_da_approvare: number;
  correzioni_da_approvare: number;
  bolle_da_verificare: number;
  fasi_ufficio: Riga[];
  documenti_cliente: Riga[] | null;
  economia: {
    canonica: Riga | null;
    mezzi: Riga | null;
    dipendenti: Riga[];
    squadre: Riga[];
    venditori: Riga[];
    errori: Riga[];
  } | null;
}

export interface AvanzamentoFasi { total: number; done: number; inCorso: number; avgPct: number | null }

/** Fasi fatte, in corso e media: completata = stato «completata» o percentuale al 100. */
export function avanzamentoFasi(rows: { status: string; percentuale: number | null }[]): AvanzamentoFasi {
  const completata = (p: { status: string; percentuale: number | null }) =>
    p.status === "completata" || Number(p.percentuale) >= 100;
  // Una fase completata senza percentuale vale 100.
  const pctDi = (p: { status: string; percentuale: number | null }) =>
    completata(p) ? 100 : Math.min(100, Math.max(0, Number(p.percentuale) || 0));
  return {
    total: rows.length,
    done: rows.filter(completata).length,
    inCorso: rows.filter((p) => !completata(p) && (p.status === "in_corso" || Number(p.percentuale) > 0)).length,
    avgPct: rows.length > 0 ? rows.reduce((s, p) => s + pctDi(p), 0) / rows.length : null,
  };
}

/** Le fatture della commessa come le unisce useFattureByOrdine: una per id, con la quota della commessa. */
export function fattureDellaCommessa(scheda: Pick<SchedaCommessa, "fatture_collegate" | "fatture_dirette" | "fatture_da_collegamento">) {
  const quota = new Map<string, number | null>();
  for (const j of scheda.fatture_collegate) {
    if (j.importo_associato != null) quota.set(j.fattura_id, Number(j.importo_associato));
  }
  const tutte = new Map<string, Riga & { id: string; importo_associato: number | null }>();
  const conQuota = (f: Riga & { id: string }) => ({ ...f, importo_associato: quota.get(f.id) ?? null });
  for (const f of scheda.fatture_da_collegamento) tutte.set(f.id, conQuota(f));
  for (const f of scheda.fatture_dirette) tutte.set(f.id, conQuota(f));
  return Array.from(tutte.values());
}

const COLONNE_RIEPILOGO_DOCUMENTI = ["id", "file_name", "file_url", "file_type", "file_size", "visible_to_customer", "created_at", "thumb_path"] as const;

/** Mette ogni pezzo della scheda sotto la chiave del componente che lo legge. */
export function seminaSchedaCommessa(qc: QueryClient, scheda: SchedaCommessa, { id, companyId }: { id: string; companyId: string }) {
  const metti = (chiave: readonly unknown[], valore: unknown) => qc.setQueryData(chiave, valore);

  metti(queryKeys.orders.statuses(companyId), scheda.stati);
  metti(["order-phases-progress", id], avanzamentoFasi(scheda.fasi));
  metti(["order-status-history", id], scheda.storia);
  metti(["order-attachments", id], scheda.allegati);
  metti(["order-documents-summary", id], scheda.allegati.slice(0, 8).map((a) =>
    Object.fromEntries(COLONNE_RIEPILOGO_DOCUMENTI.map((c) => [c, a[c] ?? null]))));
  metti(["order-next-task", id], scheda.prossima_attivita ?? null);

  if (scheda.commessa) {
    const { percentuale_avanzamento, ...collegamento } = scheda.commessa;
    metti(["order-contract-link", companyId, id], collegamento);
    metti(["order-avanzamento", id], percentuale_avanzamento == null ? null : Number(percentuale_avanzamento));
  }

  const imp = scheda.impostazioni_fasi;
  metti(["peso-media-fasi", companyId], pesoMediaValido(imp?.peso_media));
  metti(["impostazioni-avvio", companyId], {
    modelloFasi: imp?.modello_fasi_predefinito ?? null,
    controlli: controlliValidi(imp?.controlli_avvio),
  });

  metti(["ordine-fatture", id, companyId], fattureDellaCommessa(scheda));
  metti(["ordini-variazione", id, companyId], scheda.varianti);
  metti(queryKeys.orders.installments(id), scheda.rate);
  metti(["order-items", id], scheda.materiali);
  metti(["order-campo-assignments", id], scheda.accessi);
  metti(["order-workforce-presence", id], scheda.manodopera_presente);
  metti(["campo-rapportini-ordine", id, "da-approvare"], scheda.rapportini_da_approvare);
  metti(["campo-da-approvare-conteggi", id], { correzioni: scheda.correzioni_da_approvare, bolle: scheda.bolle_da_verificare });
  metti(["commessa-fasi-ufficio", id, "riepilogo"], scheda.fasi_ufficio);

  // Sopra le mille righe il pannello Assistenza avvisa che l'elenco è incompleto: lo lascia leggere a lui.
  if (scheda.ticket && scheda.ticket.length < 1000) metti(["order-tickets", id, companyId], scheda.ticket);
  if (scheda.documenti_cliente) metti(["documenti-cliente-commessa", id], scheda.documenti_cliente);

  const e = scheda.economia;
  if (e) {
    metti(["order-economics-canonical", id], e.canonica ?? null);
    metti(["order-economics-vehicles", id], e.mezzi ?? null);
    metti(["oes-employees", id], e.dipendenti);
    metti(["oes-external-teams", id], e.squadre);
    metti(["oes-salespeople", id], e.venditori);
    metti(["oes-errors", id], e.errori);
  }
}
