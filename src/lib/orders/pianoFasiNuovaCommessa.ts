/**
 * Le date delle fasi di una commessa che sta nascendo (07/11/2026): una fase dopo
 * l'altra, sui giorni di lavoro del cantiere, dalla data di inizio lavori.
 * Regole pure, nessun React né database.
 *
 * Quanti giorni dura ogni fase:
 *   1. quelli scritti a mano sulla fase;
 *   2. altrimenti quelli delle sue sottofasi (le sottofasi «in parallelo» non allungano);
 *   3. altrimenti i giorni di lavoro fra inizio e fine lavori, divisi in parti
 *      uguali fra le fasi rimaste (i giorni avanzati vanno alle prime).
 * Senza data di inizio non c'è nessuna data; senza fine lavori le fasi del punto 3
 * restano senza durata e senza date, e le altre continuano in fila.
 */
import { fineDaGiorni, fineLavorativa, primoLavorativo, type GiornoLavorativo } from "./sottofasi";
import type { FaseModello, SottofaseModello } from "./modelliFasi";

export type OrigineGiorni = "mano" | "sottofasi" | "divisi" | null;

export interface FasePianificata {
  giorni: number | null;
  origine: OrigineGiorni;
  dal: string | null;
  al: string | null;
}

export interface PianoFasi {
  righe: FasePianificata[];
  /** L'ultimo giorno dell'ultima fase con le date. */
  fineFasi: string | null;
  /** Le fasi finiscono dopo la fine lavori scritta. */
  oltreFine: boolean;
}

const MAX_GIORNI = 3650;

/** I giorni delle sottofasi in fila: quelle «in parallelo» corrono accanto alla precedente. */
export function giorniDaSottofasi(f: Pick<FaseModello, "sottofasi">): number | null {
  let totale = 0;
  let corrente = 0;
  for (const s of f.sottofasi) {
    const g = s.giorni && s.giorni > 0 ? Math.round(s.giorni) : 0;
    if (s.in_parallelo && corrente > 0) {
      if (g > corrente) { totale += g - corrente; corrente = g; }
    } else {
      totale += g;
      corrente = g;
    }
  }
  return totale > 0 ? Math.min(totale, MAX_GIORNI) : null;
}

/**
 * Una fase a cui si cambia la durata a mano: le sottofasi la seguono, altrimenti
 * nella commessa una fase di 10 giorni conterrebbe 21 giorni di lavoro. La
 * differenza la assorbe la sottofase più lunga (l'attesa della merce, non il
 * rilievo); nessuna scende sotto un giorno.
 */
export function sottofasiSullaDurata<T extends SottofaseModello>(sottofasi: ReadonlyArray<T>, giorni: number | null | undefined): T[] {
  const copia = sottofasi.map((s) => ({ ...s }));
  if (!giorni || giorni < 1 || giorniDaSottofasi({ sottofasi: copia }) === giorni) return copia;
  const inFila = copia.filter((s, i) => (!s.in_parallelo || i === 0) && s.giorni && s.giorni > 0);
  const attuali = inFila.reduce((n, s) => n + (s.giorni as number), 0);
  if (!attuali) return copia;
  const piuLunghe = [...inFila].sort((a, b) => (b.giorni as number) - (a.giorni as number));
  if (giorni > attuali) {
    piuLunghe[0].giorni = (piuLunghe[0].giorni as number) + giorni - attuali;
  } else {
    let daTogliere = attuali - giorni;
    for (const s of piuLunghe) {
      const via = Math.min(daTogliere, (s.giorni as number) - 1);
      s.giorni = (s.giorni as number) - via;
      daTogliere -= via;
    }
  }
  // Una parallela non può durare più della sottofase accanto a cui corre.
  let corrente = 0;
  for (const s of copia) {
    if (s.in_parallelo && corrente > 0) {
      if (s.giorni && s.giorni > corrente) s.giorni = corrente;
    } else {
      corrente = s.giorni && s.giorni > 0 ? s.giorni : 0;
    }
  }
  return copia;
}

/** Le fasi da spedire al server: con le date del piano e le sottofasi coerenti con la durata. */
export function fasiColPiano<T extends FaseModello>(fasi: ReadonlyArray<T>, piano: PianoFasi) {
  return fasi.map((f, i) => {
    const riga = piano.righe[i];
    return {
      ...f,
      sottofasi: riga?.origine === "mano" ? sottofasiSullaDurata(f.sottofasi, riga.giorni) : f.sottofasi,
      data_inizio: riga?.dal ?? null,
      data_fine: riga?.al ?? null,
    };
  });
}

/** I giorni di lavoro da `da` ad `a`, estremi compresi. */
export function contaLavorativi(da: string, a: string, lavorativo: GiornoLavorativo): number {
  if (a < da) return 0;
  let n = 0;
  let d = da;
  for (let i = 0; i <= MAX_GIORNI && d <= a; i++) {
    if (lavorativo(d)) n++;
    d = fineDaGiorni(d, 2);
  }
  return n;
}

export function pianificaFasi(
  fasi: ReadonlyArray<Pick<FaseModello, "sottofasi"> & { giorni?: number | null }>,
  { inizio, fine, lavorativo }: { inizio: string | null; fine: string | null; lavorativo: GiornoLavorativo },
): PianoFasi {
  const righe = fasi.map((f): FasePianificata => {
    if (f.giorni && f.giorni > 0) return { giorni: Math.min(Math.round(f.giorni), MAX_GIORNI), origine: "mano", dal: null, al: null };
    const g = giorniDaSottofasi(f);
    return g ? { giorni: g, origine: "sottofasi", dal: null, al: null } : { giorni: null, origine: null, dal: null, al: null };
  });

  // Il tempo che resta fra inizio e fine, diviso fra le fasi senza durata.
  const libere = righe.map((r, i) => (r.giorni === null ? i : -1)).filter((i) => i >= 0);
  if (libere.length && inizio && fine && fine >= inizio) {
    const fissi = righe.reduce((s, r) => s + (r.giorni ?? 0), 0);
    const disponibili = contaLavorativi(inizio, fine, lavorativo) - fissi;
    const base = Math.max(1, Math.floor(disponibili / libere.length));
    let resto = disponibili >= libere.length ? disponibili - base * libere.length : 0;
    for (const i of libere) {
      righe[i] = { giorni: base + (resto > 0 ? 1 : 0), origine: "divisi", dal: null, al: null };
      if (resto > 0) resto--;
    }
  }

  if (!inizio) return { righe, fineFasi: null, oltreFine: false };
  let cursore = primoLavorativo(inizio, lavorativo);
  let fineFasi: string | null = null;
  for (const r of righe) {
    if (!r.giorni) continue;
    r.dal = cursore;
    r.al = fineLavorativa(cursore, r.giorni, lavorativo);
    fineFasi = r.al;
    cursore = primoLavorativo(fineDaGiorni(r.al, 2), lavorativo);
  }
  return { righe, fineFasi, oltreFine: !!(fine && fineFasi && fineFasi > fine) };
}
