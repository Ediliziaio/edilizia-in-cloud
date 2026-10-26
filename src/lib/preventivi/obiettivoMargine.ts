/**
 * Calcolo a ritroso del margine: «lavoro a X euro, voglio il Y%: quanto posso spendere?».
 *
 * Solo aritmetica, nessuna stima: parte dai costi che il computo già contiene (materiali e manodopera per
 * riga) e dai totali già calcolati dal modulo (`calcTotaliComputo`), così vale per gli otto preventivatori
 * edili anche dove l'IVA non è unica (ristrutturazione: beni significativi). Il margine è quello del resto del
 * sistema: (netto − costi) / netto, con il netto già scontato e IVA esclusa.
 *
 * Costi incompleti (righe vendute senza costo): il tetto di costo si calcola lo stesso, perché dipende solo da
 * prezzo e margine; scarto e prezzo minimo no, e il risultato lo dice invece di inventare un numero.
 */
export interface RigaCosto {
  descrizione?: string | null;
  capitolo_nome?: string | null;
  quantita?: number | string | null;
  costo_materiali?: number | string | null;
  costo_manodopera?: number | string | null;
}

/** Totali già calcolati dal modulo, IVA esclusa salvo `totale`. */
export interface BaseEconomica {
  imponibile: number;
  totale: number;
  costoTot: number;
  righeSenzaCosto: number;
}

export interface ObiettivoMargine {
  /** Margine desiderato in % (0–94). */
  marginePct: number;
  /** Prezzo che si vuole raggiungere; vuoto = quello attuale del preventivo. */
  prezzo: number | null;
  /** `prezzo` è IVA inclusa. */
  prezzoIvato: boolean;
}

export interface VoceDaRivedere {
  descrizione: string;
  capitolo: string;
  costo: number;
  quotaPct: number;
  taglio: number;
}

export type EsitoObiettivo =
  | { stato: 'non_valido'; motivo: string }
  | { stato: 'costi_incompleti'; righeSenzaCosto: number; prezzoNetto: number; tettoCosto: number }
  | {
      stato: 'ok' | 'sforo';
      prezzoNetto: number;
      prezzoIvato: number;
      tettoCosto: number;
      costoAttuale: number;
      /** Costi attuali meno tetto: positivo = si sfora, negativo = c'è spazio. */
      scarto: number;
      scartoPct: number;
      margineAlPrezzoPct: number;
      prezzoMinimoNetto: number;
      prezzoMinimoIvato: number;
      materiali: number;
      manodopera: number;
      quotaMaterialiPct: number;
      quotaManodoperaPct: number;
      voci: VoceDaRivedere[];
    };

const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const r2 = (v: number): number => Math.round((v + Number.EPSILON) * 100) / 100;
const pct = (v: number): number => Math.round(v * 10) / 10;

export const MARGINE_MASSIMO_PCT = 94;

export function calcObiettivoMargine(righe: RigaCosto[], base: BaseEconomica, obiettivo: ObiettivoMargine): EsitoObiettivo {
  const margine = n(obiettivo.marginePct) / 100;
  if (!(margine >= 0 && margine <= MARGINE_MASSIMO_PCT / 100)) {
    return { stato: 'non_valido', motivo: `Il margine va da 0% a ${MARGINE_MASSIMO_PCT}%.` };
  }
  const fattoreIva = base.imponibile > 0 && base.totale >= base.imponibile ? base.totale / base.imponibile : 1;
  const prezzoScelto = n(obiettivo.prezzo);
  const prezzoNetto = r2(prezzoScelto > 0 ? (obiettivo.prezzoIvato ? prezzoScelto / fattoreIva : prezzoScelto) : base.imponibile);
  if (!(prezzoNetto > 0)) return { stato: 'non_valido', motivo: 'Indica il prezzo che vuoi raggiungere.' };
  const tettoCosto = r2(prezzoNetto * (1 - margine));
  if (base.righeSenzaCosto > 0) return { stato: 'costi_incompleti', righeSenzaCosto: base.righeSenzaCosto, prezzoNetto, tettoCosto };

  const costoAttuale = r2(base.costoTot);
  const scarto = r2(costoAttuale - tettoCosto);
  const righeCosto = righe.map(r => {
    const q = Math.max(0, n(r.quantita));
    return {
      descrizione: (r.descrizione ?? '').trim() || 'Voce senza descrizione',
      capitolo: r.capitolo_nome || 'Generale',
      materiali: n(r.costo_materiali) * q,
      manodopera: n(r.costo_manodopera) * q,
    };
  });
  const materiali = r2(righeCosto.reduce((s, r) => s + r.materiali, 0));
  const manodopera = r2(righeCosto.reduce((s, r) => s + r.manodopera, 0));
  const costoRighe = materiali + manodopera;
  const voci: VoceDaRivedere[] = righeCosto
    .map(r => ({ descrizione: r.descrizione, capitolo: r.capitolo, costo: r2(r.materiali + r.manodopera) }))
    .filter(r => r.costo > 0)
    .sort((a, b) => b.costo - a.costo)
    .slice(0, 5)
    .map(r => ({ ...r, quotaPct: costoRighe > 0 ? pct((r.costo / costoRighe) * 100) : 0, taglio: scarto > 0 && costoRighe > 0 ? r2((r.costo / costoRighe) * scarto) : 0 }));
  const prezzoMinimoNetto = r2(costoAttuale / (1 - margine));
  return {
    stato: scarto > 0.005 ? 'sforo' : 'ok',
    prezzoNetto,
    prezzoIvato: r2(prezzoNetto * fattoreIva),
    tettoCosto,
    costoAttuale,
    scarto,
    scartoPct: costoAttuale > 0 ? pct((scarto / costoAttuale) * 100) : 0,
    margineAlPrezzoPct: pct(((prezzoNetto - costoAttuale) / prezzoNetto) * 100),
    prezzoMinimoNetto,
    prezzoMinimoIvato: r2(prezzoMinimoNetto * fattoreIva),
    materiali,
    manodopera,
    quotaMaterialiPct: costoRighe > 0 ? pct((materiali / costoRighe) * 100) : 0,
    quotaManodoperaPct: costoRighe > 0 ? pct((manodopera / costoRighe) * 100) : 0,
    voci,
  };
}
