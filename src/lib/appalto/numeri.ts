/**
 * I numeri dell'appalto, fuori dalla pagina.
 *
 * Qui dentro c'è l'unica cosa che non è una somma del database: come si legge
 * una serie di mesi. Un margine che scende da mesi è la risposta alla domanda
 * «quale committente mi conviene davvero», e va detta in parole, non lasciata a
 * chi sa leggere una colonna di percentuali.
 *
 * Fase 6 del Modulo Appaltatori (28/10/2026).
 */

export interface ContiCommittente {
  committente_id: string;
  nome: string;
  cantieri: number;
  righe: number;
  rendicontato: number;
  in_bozza: number;
  costo: number | null;
  margine: number | null;
  margine_pct: number | null;
  rendicontato_con_costo: number | null;
  righe_senza_costo: number;
  rendiconti: number;
  chiuso_in_rendiconti: number;
  da_rendicontare: number;
  ritenuta_trattenuta: number;
  fatturato: number;
  incassato: number;
  da_incassare: number;
}

export interface MeseMargine {
  mese: string;
  committente_id: string;
  nome: string;
  rendicontato: number;
  costo: number | null;
  margine: number | null;
  margine_pct: number | null;
  rendicontato_con_costo: number | null;
  righe_senza_costo: number;
}

/**
 * Quanta parte del rendicontato ha un costo noto, in percentuale.
 *
 * Serve a dire «margine sul 94% del rendicontato»: un margine calcolato su
 * metà delle righe non è il margine, e il titolare ci prende una decisione
 * sopra. `null` quando non si sa niente.
 */
export function coperturaCosti(c: {
  rendicontato: number;
  rendicontato_con_costo: number | null;
}): number | null {
  if (c.rendicontato_con_costo === null || Number(c.rendicontato) <= 0) return null;
  return Math.round((Number(c.rendicontato_con_costo) * 100) / Number(c.rendicontato));
}

export type Tendenza = "peggiora" | "migliora" | "stabile" | "non-si-sa";

export interface LetturaTendenza {
  tendenza: Tendenza;
  /** Punti percentuali di differenza fra la seconda metà e la prima. */
  delta: number | null;
  /** Quanti mesi con un margine calcolabile hanno partecipato. */
  mesi: number;
}

/**
 * Come va il margine di un committente nel tempo.
 *
 * Confronta la **mediana** della seconda metà dei mesi con quella della prima,
 * non l'ultimo mese col penultimo e non la media. La media l'avevo scritta per
 * prima, e la prova l'ha bocciata: cinque mesi al 30% e uno al 20% le facevano
 * dire «peggiora», perché un valore isolato tira la media di tre punti. La
 * mediana non si muove, ed è giusto così — un mese brutto non è una tendenza.
 *
 * Soglia a 2 punti percentuali: sotto, è rumore. Servono almeno quattro mesi
 * con un margine calcolabile, altrimenti la risposta onesta è «non si sa».
 */
export function tendenzaMargine(
  mesi: ReadonlyArray<{ mese: string; margine_pct: number | null }>,
  sogliaPunti = 2,
): LetturaTendenza {
  const utili = mesi
    .filter((m) => m.margine_pct !== null)
    .slice()
    .sort((a, b) => (a.mese < b.mese ? -1 : a.mese > b.mese ? 1 : 0));

  if (utili.length < 4) return { tendenza: "non-si-sa", delta: null, mesi: utili.length };

  const meta = Math.floor(utili.length / 2);
  const mediana = (xs: typeof utili): number => {
    const v = xs.map((m) => Number(m.margine_pct)).sort((a, b) => a - b);
    const i = Math.floor(v.length / 2);
    return v.length % 2 === 0 ? (v[i - 1] + v[i]) / 2 : v[i];
  };
  const prima = mediana(utili.slice(0, meta));
  const dopo = mediana(utili.slice(utili.length - meta));
  const delta = Math.round((dopo - prima) * 10) / 10;

  return {
    tendenza: delta <= -sogliaPunti ? "peggiora" : delta >= sogliaPunti ? "migliora" : "stabile",
    delta,
    mesi: utili.length,
  };
}

/** I totali di tutti i committenti: la riga in fondo alla tabella. */
export function totaliConti(righe: ReadonlyArray<ContiCommittente>): {
  rendicontato: number;
  margine: number | null;
  margine_pct: number | null;
  da_rendicontare: number;
  ritenuta_trattenuta: number;
  fatturato: number;
  da_incassare: number;
} {
  const somma = (f: (c: ContiCommittente) => number) => righe.reduce((s, c) => s + Number(f(c) || 0), 0);
  const conCosto = righe.filter((c) => c.margine !== null);
  const margine = conCosto.length > 0 ? conCosto.reduce((s, c) => s + Number(c.margine), 0) : null;
  const baseNota = conCosto.reduce((s, c) => s + Number(c.rendicontato_con_costo ?? 0), 0);
  return {
    rendicontato: somma((c) => c.rendicontato),
    margine,
    // Anche qui il denominatore è il ricavo di cui si conosce il costo.
    margine_pct: margine !== null && baseNota > 0 ? Math.round((margine * 1000) / baseNota) / 10 : null,
    da_rendicontare: somma((c) => c.da_rendicontare),
    ritenuta_trattenuta: somma((c) => c.ritenuta_trattenuta),
    fatturato: somma((c) => c.fatturato),
    da_incassare: somma((c) => c.da_incassare),
  };
}

/** Il periodo che la pagina propone: le scelte che hanno senso, non un calendario. */
export type PeriodoNumeri = "anno" | "dodici-mesi" | "tutto";

export function periodoNumeri(p: PeriodoNumeri, oggi: Date = new Date()): { dal: string | null; al: string | null } {
  if (p === "tutto") return { dal: null, al: null };
  const anno = oggi.getFullYear();
  if (p === "anno") return { dal: `${anno}-01-01`, al: `${anno}-12-31` };
  // Dodici mesi INTERI: dal primo del mese di undici mesi fa all'ultimo giorno
  // del mese in corso. Finiva a oggi, e un rendiconto mensile — che copre il
  // mese fino al 31 — restava fuori dalla finestra per tutto il mese: il 29
  // ottobre il rendiconto di ottobre non c'era, e con lui sparivano la sua
  // ritenuta e la sua fattura. «Quest'anno» finisce al 31/12 per lo stesso
  // motivo; qui era rimasta l'incoerenza.
  const m = oggi.getMonth(); // 0-11
  const dalAnno = m >= 11 ? anno : anno - 1;
  const dalMese = ((m + 1) % 12) + 1; // 1-12
  const mm = String(dalMese).padStart(2, "0");
  const ultimo = new Date(Date.UTC(anno, m + 1, 0)).getUTCDate();
  const al = `${anno}-${String(m + 1).padStart(2, "0")}-${String(ultimo).padStart(2, "0")}`;
  return { dal: `${dalAnno}-${mm}-01`, al };
}

/**
 * La tendenza di OGNI committente, quando se ne guardano piu' d'uno.
 *
 * `tendenzaMargine` su una serie che contiene piu' committenti non legge una
 * curva: legge righe di committenti diversi messe in fila. Con un committente
 * fermo al 30% e uno che scende dal 18 al 10 il risultato usciva «margine
 * stabile» — cioe' la pagina nascondeva esattamente la cosa per cui esiste.
 * Qui ognuno ha la sua lettura, e chi peggiora si chiama per nome.
 */
export interface TendenzaCommittente extends LetturaTendenza {
  committente_id: string;
  nome: string;
}

export function tendenzePerCommittente(
  serie: ReadonlyArray<Pick<MeseMargine, "mese" | "margine_pct" | "committente_id" | "nome">>,
): TendenzaCommittente[] {
  const per = new Map<string, { nome: string; righe: Array<{ mese: string; margine_pct: number | null }> }>();
  for (const r of serie) {
    if (!r?.committente_id) continue;
    const voce = per.get(r.committente_id) ?? { nome: r.nome, righe: [] };
    voce.righe.push({ mese: r.mese, margine_pct: r.margine_pct });
    per.set(r.committente_id, voce);
  }
  return [...per.entries()]
    .map(([committente_id, v]) => ({ committente_id, nome: v.nome, ...tendenzaMargine(v.righe) }))
    .sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0));
}

export const MESI_IT = [
  "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
];

/** «ott 2026» da «2026-10-01». */
export function meseBreve(iso: string): string {
  const [a, m] = iso.slice(0, 10).split("-");
  const i = Number(m) - 1;
  return i >= 0 && i < 12 ? `${MESI_IT[i].slice(0, 3)} ${a}` : iso;
}
