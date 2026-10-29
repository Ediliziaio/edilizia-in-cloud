/**
 * Storico già registrato: le fatture importate con data fino alla data di taglio
 * (billing_integrations.storico_registrato_fino_al) sono già registrate, pagate e
 * incassate nel gestionale di prima. Qui non devono diventare cose da incassare,
 * leggere o contabilizzare. Modulo puro: lo usa billing-import, lo provano i test.
 *
 * Stessa regola di fatturazione_segna_storico() nel database, che fa lo stesso
 * per le fatture già importate quando la data viene salvata.
 */

/** Data ISO (YYYY-MM-DD) del documento entro la data di taglio. */
export function eStorico(dataDocumento: string | null | undefined, finoAl: string | null | undefined): boolean {
  if (!finoAl || !dataDocumento) return false;
  return String(dataDocumento).slice(0, 10) <= String(finoAl).slice(0, 10);
}

const NOTE_DI_CREDITO = new Set(["credit_note", "nota_credito"]);

/**
 * Campi da sovrascrivere su una fattura emessa storica. Le stornate e le
 * annullate restano come sono: lo storno ha già deciso. Una nota di credito si
 * chiude senza incasso (lo storno non è un incasso).
 */
export function campiEmessaStorica(
  inv: { issueDate?: string | null; dueDate?: string | null; total?: number | null; documentType?: string | null },
  finoAl: string | null | undefined,
  statoEsistente: string | null | undefined,
): Record<string, unknown> | null {
  if (!eStorico(inv.issueDate, finoAl)) return null;
  if (statoEsistente && ["credited", "cancelled", "draft"].includes(statoEsistente)) return null;
  const notaCredito = NOTE_DI_CREDITO.has(String(inv.documentType ?? ""));
  return {
    status: "paid",
    ...(notaCredito ? {} : { paid_amount: Number(inv.total ?? 0) }),
    payment_date: inv.dueDate || inv.issueDate || null,
    storico_esterno: true,
  };
}

/**
 * Campi da sovrascrivere su una fattura ricevuta storica: contabilizzata senza
 * costo. Su una già presente si cambia lo stato solo se nessuno l'ha toccata
 * (niente costo, niente prima nota, non rifiutata).
 */
export function campiRicevutaStorica(
  dataFattura: string | null | undefined,
  finoAl: string | null | undefined,
  esistente?: { stato?: string | null; company_cost_id?: string | null; prima_nota_id?: string | null } | null,
): Record<string, unknown> | null {
  if (!eStorico(dataFattura, finoAl)) return null;
  if (esistente) {
    const intatta = ["non_letta", "letta"].includes(String(esistente.stato ?? "")) && !esistente.company_cost_id && !esistente.prima_nota_id;
    if (!intatta) return null;
  }
  return { stato: "contabilizzata", storico_esterno: true };
}
