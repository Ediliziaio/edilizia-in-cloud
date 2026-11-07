/**
 * Regole della pagina del giornale dei lavori. Le stesse le fa rispettare il
 * database (trigger trg_giornale_lavori_guardia_firma e policy): qui servono
 * per non mostrare bottoni che finirebbero in un errore.
 *   bozza   → si modifica, si firma, si elimina;
 *   firmata → sola lettura, si aggiungono annotazioni.
 */
export type StatoGiornale = "bozza" | "firmata";

export interface RegoleGiornale {
  stato: StatoGiornale;
  puoModificare: boolean;
  puoFirmare: boolean;
  puoEliminare: boolean;
  puoAnnotare: boolean;
}

export function statoGiornale(riga: { stato?: string | null } | null | undefined): StatoGiornale {
  return riga?.stato === "firmata" ? "firmata" : "bozza";
}

/**
 * `riga` null = pagina nuova non ancora salvata. `haPermesso` = può modificare il
 * giornale (permesso o amministratore).
 */
export function regoleGiornale(
  riga: { id?: string | null; stato?: string | null; lavorazioni_eseguite?: string | null } | null | undefined,
  haPermesso: boolean,
): RegoleGiornale {
  const stato = statoGiornale(riga);
  const salvata = !!riga?.id;
  const bozza = stato === "bozza";
  return {
    stato,
    puoModificare: haPermesso && bozza,
    puoFirmare: haPermesso && bozza && salvata && !!riga?.lavorazioni_eseguite?.trim(),
    puoEliminare: haPermesso && bozza && salvata,
    puoAnnotare: haPermesso && !bozza && salvata,
  };
}

/** La pagina già scritta per quel cantiere e quel giorno, se c'è: una pagina per giorno. */
export function paginaDelGiorno<T extends { order_id?: string | null; data_lavori?: string | null }>(
  righe: readonly T[],
  orderId: string | null | undefined,
  data: string | null | undefined,
): T | undefined {
  if (!orderId || !data) return undefined;
  return righe.find((r) => r.order_id === orderId && r.data_lavori === data);
}

/** L'errore del database detto in chiaro (le guardie della firma parlano già italiano). */
export function messaggioErroreGiornale(err: { message?: string | null; code?: string | null } | null | undefined): string {
  const msg = err?.message ?? "";
  if (err?.code === "23505" || msg.includes("giornale_lavori_order_id_data_lavori_key")) {
    return "Per questo cantiere c'è già la pagina di questo giorno: aprila dall'elenco.";
  }
  if (msg.includes("row-level security")) return "Non hai il permesso di modificare il giornale dei lavori.";
  return msg || "Operazione non riuscita.";
}
