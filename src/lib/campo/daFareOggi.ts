/**
 * «Cosa c'è da fare oggi» su un cantiere (collaudo 23/11/2026, richiesta del founder).
 *
 * Prima l'operaio vedeva le fasi solo se l'ufficio le aveva assegnate a lui con le date di oggi: sui cantieri
 * senza quel dettaglio (quasi tutti) non c'era scritto niente. Qui si sceglie dalle fasi del cantiere:
 * 1) quelle in corso; 2) quelle già partite o in ritardo; 3) la prossima da iniziare. Al massimo tre nomi.
 */
export interface FaseDaFare {
  order_id: string;
  name: string;
  status: string | null;
  position: number | null;
  start_date: string | null;
  end_date: string | null;
}

export interface DaFareOggi {
  /** I nomi da mostrare, già in ordine. */
  fasi: string[];
  /** Fasi ancora aperte sul cantiere, comprese quelle non mostrate. */
  aperte: number;
  /** Fasi in totale e completate: lo stato del cantiere in breve. */
  totali: number;
  fatte: number;
}

const MAX = 3;

export function daFareOggi(fasi: FaseDaFare[], oggi: string): DaFareOggi {
  const ordinate = [...fasi].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const aperte = ordinate.filter(f => f.status !== "completata");
  const inCorso = aperte.filter(f => f.status === "in_corso");
  const partite = aperte.filter(f => f.status !== "in_corso" && !!f.start_date && f.start_date <= oggi);
  const scelte = [...inCorso, ...partite];
  if (scelte.length === 0 && aperte[0]) scelte.push(aperte[0]);
  return {
    fasi: scelte.slice(0, MAX).map(f => f.name.trim()).filter(Boolean),
    aperte: aperte.length,
    totali: ordinate.length,
    fatte: ordinate.length - aperte.length,
  };
}
