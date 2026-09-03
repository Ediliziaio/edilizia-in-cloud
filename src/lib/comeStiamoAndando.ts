/**
 * "Come stiamo andando" — la logica dietro la schermata unica.
 *
 * Oggi per farsi un'idea servono quattro pagine: cruscotto, tesoreria,
 * scadenzario, commesse. Nessuna delle quattro risponde da sola alla domanda
 * che uno si fa la mattina, che è sempre la stessa: stiamo incassando quello
 * che avevamo previsto, i cantieri aperti stanno guadagnando, quanto mi devono
 * e cosa devo guardare oggi.
 *
 * Qui c'è solo il ragionamento — chi è "aperto", come si sta rispetto alla
 * previsione, cosa merita attenzione e in che ordine. I dati li mette la
 * pagina, riusando `useCruscottoData` invece di rifare le query.
 */

export interface CantiereMargine {
  id: string | null;
  order_code: string | null;
  description: string | null;
  cliente_nome: string | null;
  margine: number | null;
  margine_perc: number | null;
  preventivo_totale: number | null;
  work_start_date: string | null;
  work_end_date: string | null;
}

/**
 * Un cantiere è aperto se è cominciato e non è ancora finito.
 *
 * Le due sfumature che contano:
 *  - senza data di inizio non è cominciato: è ancora un contratto, non un
 *    cantiere, e mescolarlo falserebbe il margine "di quello che sto facendo";
 *  - senza data di fine è aperto (fine non ancora pianificata), non chiuso.
 */
export function eAperto(c: Pick<CantiereMargine, "work_start_date" | "work_end_date">, oggi = new Date()): boolean {
  if (!c.work_start_date) return false;
  const giorno = oggi.toISOString().slice(0, 10);
  if (c.work_start_date > giorno) return false;      // comincia più avanti
  if (!c.work_end_date) return true;                  // fine non pianificata
  return c.work_end_date >= giorno;
}

/** Un cantiere aperto la cui fine pianificata è già passata è in ritardo. */
export function eInRitardo(c: Pick<CantiereMargine, "work_start_date" | "work_end_date">, oggi = new Date()): boolean {
  if (!c.work_start_date || !c.work_end_date) return false;
  const giorno = oggi.toISOString().slice(0, 10);
  return c.work_start_date <= giorno && c.work_end_date < giorno;
}

export interface MargineCantieriAperti {
  /** Quanti cantieri sono aperti adesso. */
  quanti: number;
  /** Somma dei margini, in euro. */
  margineEuro: number;
  /** Somma dei preventivi, in euro: il denominatore della percentuale. */
  valoreEuro: number;
  /**
   * Margine percentuale pesato sul valore, NON la media delle percentuali:
   * la media tratterebbe un cantiere da 2.000 € come uno da 200.000 €.
   * `null` quando non c'è valore su cui calcolarlo — e allora si dice, non si
   * scrive 0%.
   */
  marginePerc: number | null;
  /** I peggiori per margine percentuale, per guardarli subito. */
  peggiori: CantiereMargine[];
}

export function margineCantieriAperti(
  cantieri: CantiereMargine[],
  oggi = new Date(),
  quantiPeggiori = 3,
): MargineCantieriAperti {
  const aperti = cantieri.filter((c) => eAperto(c, oggi));
  const margineEuro = aperti.reduce((s, c) => s + (c.margine ?? 0), 0);
  const valoreEuro = aperti.reduce((s, c) => s + (c.preventivo_totale ?? 0), 0);
  const peggiori = [...aperti]
    .filter((c) => c.margine_perc != null)
    .sort((a, b) => (a.margine_perc ?? 0) - (b.margine_perc ?? 0))
    .slice(0, quantiPeggiori);
  return {
    quanti: aperti.length,
    margineEuro,
    valoreEuro,
    marginePerc: valoreEuro > 0 ? (margineEuro / valoreEuro) * 100 : null,
    peggiori,
  };
}

export interface AndamentoIncassi {
  incassato: number;
  previsione: number | null;
  /** Quanto manca alla previsione. Negativo = si è già oltre. */
  mancante: number | null;
  /** Percentuale della previsione raggiunta, `null` se non c'è previsione. */
  percentuale: number | null;
  /** Frazione del mese trascorsa, per capire se si è avanti o indietro. */
  meseTrascorso: number;
  /** `true` se si sta sotto il ritmo che servirebbe. `null` senza previsione. */
  sottoRitmo: boolean | null;
}

/**
 * Incassato contro previsione, con il tempo dentro: 60% della previsione a
 * metà mese è avanti, lo stesso 60% il 28 è indietro. Senza il tempo, il
 * numero non dice niente.
 */
export function andamentoIncassi(
  incassato: number,
  previsione: number | null | undefined,
  oggi = new Date(),
): AndamentoIncassi {
  const giorniMese = new Date(oggi.getFullYear(), oggi.getMonth() + 1, 0).getDate();
  const meseTrascorso = oggi.getDate() / giorniMese;
  if (!previsione || previsione <= 0) {
    return { incassato, previsione: null, mancante: null, percentuale: null, meseTrascorso, sottoRitmo: null };
  }
  const percentuale = (incassato / previsione) * 100;
  return {
    incassato,
    previsione,
    mancante: previsione - incassato,
    percentuale,
    meseTrascorso,
    sottoRitmo: incassato < previsione * meseTrascorso,
  };
}

export type GravitaAttenzione = "urgente" | "attenzione" | "informativa";

export interface VoceAttenzione {
  id: string;
  gravita: GravitaAttenzione;
  titolo: string;
  dettaglio: string;
  /** Dove si va a rimediare. */
  url: string;
  /** Importo in euro, quando la voce ne ha uno: usato per ordinare a parità. */
  importo?: number;
}

const PESO: Record<GravitaAttenzione, number> = { urgente: 0, attenzione: 1, informativa: 2 };

/**
 * Ordina l'elenco di oggi: prima per gravità, poi per importo. Chi apre la
 * schermata deve trovare in cima la cosa che costa di più non fare.
 */
export function ordinaAttenzioni(voci: VoceAttenzione[]): VoceAttenzione[] {
  return [...voci].sort((a, b) => {
    const g = PESO[a.gravita] - PESO[b.gravita];
    if (g !== 0) return g;
    return (b.importo ?? 0) - (a.importo ?? 0);
  });
}
