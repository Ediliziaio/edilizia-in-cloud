/**
 * Attese legate al calendario dell'anno (19/09/2026, sistema email di
 * EdiliziaInCloud).
 *
 * Il broadcast del martedì (Flusso J) ha 9 email a data fissa: la bozza di
 * bilancio a febbraio (settimana 6), la ripartenza di marzo (10), il DURC di
 * maggio (19) e così via fino a dicembre (50). Vanno a tutta la lista in quella
 * settimana, fuori rotazione, e in quelle settimane la rotazione slitta di una.
 * Le attese sapevano dire «fino alle 8:30» e «solo il martedì», non «il
 * martedì della settimana 6», né «ogni martedì tranne quelle 9».
 *
 * - settimanaIso: la settimana ISO 8601 di una data (la 1 è quella del primo
 *   giovedì dell'anno);
 * - leggiSettimane: le settimane scritte sul passo, come numeri o come testo;
 * - giornoAmmesso: il giorno va bene per giorni della settimana, settimane
 *   ammesse e settimane escluse;
 * - calendarioDelGiorno: oggi come record, per le condizioni «calendario.*».
 *   Chi entra nel broadcast a ottobre deve ricevere l'email di ottobre, non
 *   aspettare quella di febbraio dell'anno dopo: il flusso delle email a data
 *   fissa parte chiedendo «che settimana è oggi?».
 *
 * Nessun import: lo prova src/test/logic/attesaCalendario.test.ts.
 */

export function settimanaIso(anno: number, mese: number, giorno: number): number {
  const d = new Date(Date.UTC(anno, mese - 1, giorno));
  const giornoSettimana = d.getUTCDay() || 7; // lunedì = 1 … domenica = 7
  d.setUTCDate(d.getUTCDate() + 4 - giornoSettimana); // il giovedì della stessa settimana
  const inizioAnno = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - inizioAnno) / 86_400_000 + 1) / 7);
}

export function leggiSettimane(valore: unknown): number[] {
  const grezzi = Array.isArray(valore) ? valore : typeof valore === "string" ? valore.split(/[,;\s]+/) : [];
  return grezzi
    .map((x) => Number(x))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 53);
}

export interface GiornoRoma {
  anno: number;
  mese: number;
  giorno: number;
  /** 0 = domenica … 6 = sabato, come delay_giorni_settimana. */
  giornoSettimana: number;
}

export interface RegoleGiorno {
  giorni: number[];
  settimane: number[];
  settimaneEscluse: number[];
}

export function giornoAmmesso(data: GiornoRoma, regole: RegoleGiorno): boolean {
  if (regole.giorni.length > 0 && regole.giorni.length < 7 && !regole.giorni.includes(data.giornoSettimana)) {
    return false;
  }
  const settimana = settimanaIso(data.anno, data.mese, data.giorno);
  if (regole.settimane.length > 0 && !regole.settimane.includes(settimana)) return false;
  return !regole.settimaneEscluse.includes(settimana);
}

/** Oggi (ora italiana) come record: «calendario.settimana_iso minore 10». */
export function calendarioDelGiorno(data: GiornoRoma): Record<string, number> {
  return {
    anno: data.anno,
    mese: data.mese,
    giorno: data.giorno,
    giorno_settimana: data.giornoSettimana,
    settimana_iso: settimanaIso(data.anno, data.mese, data.giorno),
  };
}
