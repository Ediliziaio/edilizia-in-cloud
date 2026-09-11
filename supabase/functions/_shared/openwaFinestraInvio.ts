/**
 * openwaFinestraInvio — la finestra di invio "umana" per WhatsApp Locale,
 * come logica PURA (niente Deno/orologio), testabile in vitest.
 *
 * 11/09/2026: prima si leggevano solo ore intere (openwa_quiet_start/end,
 * "8"/"21") e un booleano "weekend aperto" che valeva sabato e domenica
 * insieme. Non si poteva partire esattamente alle 7:30 né aprire il solo
 * sabato mattina restando chiusi la domenica — che è esattamente quello che
 * il canale a freddo richiede (mai la domenica, il sabato solo se proprio
 * serve smaltire la coda). Ora gli orari sono in minuti dalla mezzanotte e
 * il sabato ha una soglia propria, indipendente dalla domenica.
 */

/** "7:30" o "8" → minuti dalla mezzanotte. Input vuoto/non valido → il default. */
export function parseOraMinuti(valore: string, defaultMinuti: number): number {
  const m = /^(\d{1,2})(?::(\d{1,2}))?$/.exec((valore ?? "").trim());
  if (!m) return defaultMinuti;
  const ore = parseInt(m[1], 10);
  if (!Number.isFinite(ore) || ore < 0 || ore > 24) return defaultMinuti;
  const minutiParte = m[2] != null ? Math.min(59, Math.max(0, parseInt(m[2], 10) || 0)) : 0;
  return ore * 60 + minutiParte;
}

export interface FinestraInvioArgs {
  /** Minuti dalla mezzanotte, ora locale di Roma. */
  minutiOra: number;
  /** 1 = lunedì … 7 = domenica (isodow). */
  weekday: number;
  startMinuti: number;
  endMinuti: number;
  /** true = apre TUTTO il weekend (sabato e domenica), ignora sabatoFinoMinuti. */
  weekendAperto: boolean;
  /**
   * Se impostato, il sabato è aperto dall'apertura generale fino a
   * quest'ora (minuti dalla mezzanotte), indipendentemente da weekendAperto.
   * null = sabato chiuso (comportamento storico).
   */
  sabatoFinoMinuti: number | null;
}

/** True se ORA è fuori dalla finestra di invio "umana". */
export function fuoriFinestraInvio(args: FinestraInvioArgs): boolean {
  if (args.minutiOra < args.startMinuti || args.minutiOra >= args.endMinuti) return true;

  if (args.weekday === 7) {
    // La domenica si apre SOLO col flag esplicito: è la regola che il
    // documento del founder chiama "mai la domenica" senza eccezioni.
    return !args.weekendAperto;
  }
  if (args.weekday === 6) {
    if (args.weekendAperto) return false;
    if (args.sabatoFinoMinuti != null) return args.minutiOra >= args.sabatoFinoMinuti;
    return true;
  }
  return false;
}
