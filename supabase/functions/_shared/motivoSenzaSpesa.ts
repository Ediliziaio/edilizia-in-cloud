/**
 * Perché di un cliente marketing non si legge la spesa, e cosa fare (20/09/2026).
 *
 * Nel rapporto del mattino, al posto della spesa c'era un trattino: il 20/09
 * erano 4 clienti su 7, ognuno per un motivo diverso e tutti risolvibili in
 * due minuti — BeMade con 64 account pubblicitari visibili e nessuno scelto,
 * Ser Style col collegamento scaduto da tre settimane, Ener Italia senza Meta,
 * Suntech con l'account scelto ma zero spesa. Il trattino non lo diceva a
 * nessuno.
 *
 * Nessun import: lo prova src/test/logic/rapportoMattinoSenzaSpesa.test.ts.
 */
export interface StatoSpesaCliente {
  spesa_disponibile: boolean;
  /** Stato del collegamento Meta dell'azienda del cliente (null = mai collegato). */
  meta_stato?: string | null;
  /** C'è almeno un account pubblicitario scelto. */
  meta_account?: boolean | null;
}

export function motivoSenzaSpesa(c: StatoSpesaCliente): { breve: string; cosaFare: string } | null {
  if (c.spesa_disponibile) return null;
  if (!c.meta_stato) {
    return { breve: "Meta non collegato", cosaFare: "collega Meta dentro la sua azienda (Integrazioni) e scegli il suo account pubblicitario" };
  }
  if (c.meta_stato !== "connected") {
    return { breve: "collegamento Meta scaduto", cosaFare: "ricollega Meta dentro la sua azienda: finché è scaduto non arrivano né la spesa né le richieste dei moduli" };
  }
  if (!c.meta_account) {
    return { breve: "account pubblicitario non scelto", cosaFare: "scegli il suo account in Pubblicità → Impostazioni: con l'accesso da agenzia si vedono gli account di tutti i clienti, e nessuno è scelto" };
  }
  return { breve: "nessuna spesa sull'account scelto", cosaFare: "controlla che l'account scelto sia quello su cui girano le campagne: Meta lì non segna spesa" };
}
