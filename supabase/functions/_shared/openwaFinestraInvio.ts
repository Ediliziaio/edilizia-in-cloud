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

/**
 * Fra quanti minuti la finestra riapre (0 = è aperta adesso).
 *
 * 19/09/2026: il motore delle automazioni rinviava un WhatsApp fuori orario
 * di un'ora alla volta, con un tetto di 48 rinvii. Un lead arrivato il venerdì
 * sera (finestra chiusa fino a lunedì mattina, 60 ore) finiva «fallito» la
 * domenica e il resto della sequenza non partiva più. Ora si rinvia
 * direttamente all'apertura. Si cammina a passi di 5 minuti per al massimo
 * 8 giorni: le soglie sono in minuti e un passo più fine non cambia nulla.
 */
export function minutiAllaRiapertura(args: FinestraInvioArgs): number {
  if (!fuoriFinestraInvio(args)) return 0;
  const PASSO = 5;
  const LIMITE = 8 * 24 * 60;
  let minuti = args.minutiOra;
  let giorno = args.weekday;
  for (let trascorsi = PASSO; trascorsi <= LIMITE; trascorsi += PASSO) {
    minuti += PASSO;
    if (minuti >= 1440) {
      minuti -= 1440;
      giorno = giorno === 7 ? 1 : giorno + 1;
    }
    if (!fuoriFinestraInvio({ ...args, minutiOra: minuti, weekday: giorno })) return trascorsi;
  }
  // Finestra che non apre mai (impostazioni incoerenti): si riprova fra 8 giorni.
  return LIMITE;
}

/** Una fascia oraria in minuti dalla mezzanotte: [da, a). */
export interface FasciaOraria {
  da: number;
  a: number;
}

/**
 * Le fasce orarie di un singolo passo di automazione, scritte come le scrive
 * una persona: "8-12, 14-20" oppure "8:30-12:00; 14-19:30". Pezzi illeggibili
 * si scartano; vuoto = nessun vincolo oltre alla finestra generale dei numeri.
 */
export function leggiFasceOrarie(testo: string | null | undefined): FasciaOraria[] {
  const fasce: FasciaOraria[] = [];
  for (const pezzo of String(testo ?? "").split(/[,;]/)) {
    const m = /^\s*(\d{1,2}(?::\d{1,2})?)\s*[-–]\s*(\d{1,2}(?::\d{1,2})?)\s*$/.exec(pezzo);
    if (!m) continue;
    const da = parseOraMinuti(m[1], -1);
    const a = parseOraMinuti(m[2], -1);
    if (da >= 0 && a > da) fasce.push({ da, a });
  }
  return fasce.sort((x, y) => x.da - y.da);
}

/** Minuti all'inizio della prossima fascia (0 = dentro una fascia, o nessuna fascia). */
export function minutiAllaFascia(minutiOra: number, fasce: FasciaOraria[]): number {
  if (fasce.length === 0) return 0;
  if (fasce.some((f) => minutiOra >= f.da && minutiOra < f.a)) return 0;
  const prossima = fasce.find((f) => f.da > minutiOra);
  return prossima ? prossima.da - minutiOra : 1440 - minutiOra + fasce[0].da;
}
