// src/lib/orders/generali/pianoConti.ts
// I conti del piano economico della commessa generale (piano, §B «previsto → reale → a finire»).
// Solo numeri, senza React né database: le righe del reale arrivano già abbinate alle voci
// da `commessa_generale_piano_reale` (la regola dell'abbinamento sta in SQL, la stessa che
// usa la fotografia di fine mese).
//
// Le parole, una per concetto:
//   previsto     l'importo della voce nella versione che si guarda;
//   reale        quanto è già registrato (costi delle commesse, fatture emesse), a oggi;
//   a finire     quanto manca: scritto a mano, oppure previsto − reale, mai sotto zero;
//   stima finale reale + a finire;
//   scostamento  stima finale − previsto (sui costi, positivo è male; sui ricavi è bene).
// Gli investitori usano `calcolaPianoEconomico` e poi `numeriPerInvestitori`.
import {
  CATEGORIE_CANTIERE, CATEGORIE_PIANO, CHIAVI_REALI, aggiungiMesi,
  type CategoriaPiano, type TipoVoce,
} from "@/lib/orders/generali/pianoCategorie";

/** «2027-03». */
export type Mese = string;

export interface VocePiano {
  id: string;
  tipo: TipoVoce;
  categoria: CategoriaPiano;
  descrizione: string;
  importo: number;
  mese: Mese | null;
  durataMesi: number;
  figliaId: string | null;
  /** Categorie di costo dell'azienda (normalizzate) agganciate a mano. */
  categorieCosto: string[];
  /** A finire scritto a mano; null = calcolato. */
  aFinire: number | null;
  nota: string | null;
  ordine: number;
  /** La voce dell'approvato da cui questa è copiata. */
  origineId: string | null;
}

export interface RigaReale {
  id: string;
  fonte: string;
  rifId: string | null;
  orderId: string;
  data: string | null;
  tipo: TipoVoce;
  chiave: string;
  categoria: string | null;
  descrizione: string;
  importo: number;
  /** La voce che la raccoglie; null = fuori piano. */
  voceId: string | null;
}

export interface Incasso { fatturaId: string; data: string | null; importo: number }

export const arrotonda = (n: number) => Math.round(n * 100) / 100;
const somma = (valori: number[]) => arrotonda(valori.reduce((t, v) => t + v, 0));

/** Il mese di una data «2027-03-15» → «2027-03»; senza data, il mese di riferimento. */
export const meseDi = (data: string | null | undefined, ripiego: Mese): Mese =>
  data && /^\d{4}-\d{2}/.test(data) ? data.slice(0, 7) : ripiego;

/** Quanti mesi da `da` ad `a` (stesso mese = 0). */
export function distanzaMesi(da: Mese, a: Mese): number {
  const [aa, am] = da.split("-").map(Number);
  const [ba, bm] = a.split("-").map(Number);
  return (ba - aa) * 12 + (bm - am);
}

/** Divide un importo su `durata` mesi da `mese`, al centesimo: la somma torna sempre. */
export function distribuisci(importo: number, mese: Mese, durata: number): { mese: Mese; importo: number }[] {
  const n = Math.max(1, Math.round(durata));
  const centesimi = Math.round(importo * 100);
  const base = Math.trunc(centesimi / n);
  const resto = centesimi - base * n;
  return Array.from({ length: n }, (_, i) => ({
    mese: aggiungiMesi(mese, i),
    importo: (base + (i < Math.abs(resto) ? Math.sign(resto) : 0)) / 100,
  }));
}

/** A finire di una voce: quello scritto a mano, altrimenti previsto − reale, mai sotto zero. */
export function aFinireVoce(previsto: number, reale: number, manuale: number | null): number {
  if (manuale !== null && Number.isFinite(manuale)) return arrotonda(Math.max(0, manuale));
  return arrotonda(Math.max(0, previsto - reale));
}

// ── Confronto per voce ─────────────────────────────────────────────────────

export interface RigaConfronto {
  /** id della voce, oppure «fuori:costo:materiali». */
  chiave: string;
  voce: VocePiano | null;
  tipo: TipoVoce;
  etichetta: string;
  /** Categoria della voce; per le righe fuori piano, la parola del reale. */
  categoria: string;
  previsto: number;
  /** L'importo nell'approvato (confronto da una revisione); null = voce nuova o nessun approvato. */
  approvato: number | null;
  reale: number;
  aFinire: number;
  aFinireManuale: boolean;
  stima: number;
  scostamento: number;
  righe: RigaReale[];
}

export interface TotaliColonne {
  previsto: number;
  approvato: number | null;
  reale: number;
  aFinire: number;
  stima: number;
  scostamento: number;
}

export interface Confronto {
  ricavi: RigaConfronto[];
  costi: RigaConfronto[];
  totali: { ricavi: TotaliColonne; costi: TotaliColonne; margine: TotaliColonne };
  /** Voci dell'approvato che nella revisione non ci sono più. */
  vociTolte: VocePiano[];
}

export interface Rettifiche {
  /** Ricavi a finire: −x% (prezzo più basso di quanto previsto). */
  prezzoPct?: number;
  /** Costi a finire: +y%. */
  costiPct?: number;
}

function totaliDi(righe: RigaConfronto[], approvato: number | null): TotaliColonne {
  const previsto = somma(righe.map((r) => r.previsto));
  const stima = somma(righe.map((r) => r.stima));
  return {
    previsto,
    approvato,
    reale: somma(righe.map((r) => r.reale)),
    aFinire: somma(righe.map((r) => r.aFinire)),
    stima,
    scostamento: arrotonda(stima - previsto),
  };
}

/**
 * Previsto · reale · a finire · stima finale · scostamento, voce per voce e in totale.
 * Le righe del reale che nessuna voce raccoglie diventano righe «fuori piano», una per
 * parola del reale: sono contate, così i totali tornano con le commesse.
 */
export function confrontoVoci(
  voci: VocePiano[],
  righe: RigaReale[],
  approvate: VocePiano[] | null = null,
  rettifiche: Rettifiche = {},
): Confronto {
  const perVoce = new Map<string, RigaReale[]>();
  const fuori = new Map<string, RigaReale[]>();
  const idVoci = new Set(voci.map((v) => v.id));
  for (const r of righe) {
    if (r.voceId && idVoci.has(r.voceId)) {
      perVoce.set(r.voceId, [...(perVoce.get(r.voceId) ?? []), r]);
    } else {
      const k = `fuori:${r.tipo}:${r.chiave}`;
      fuori.set(k, [...(fuori.get(k) ?? []), r]);
    }
  }
  const approvatePerId = new Map((approvate ?? []).map((a) => [a.id, a]));
  const fattore = (tipo: TipoVoce) =>
    tipo === "ricavo" ? 1 - (rettifiche.prezzoPct ?? 0) / 100 : 1 + (rettifiche.costiPct ?? 0) / 100;

  const dalleVoci: RigaConfronto[] = [...voci]
    .sort((a, b) => a.ordine - b.ordine)
    .map((v): RigaConfronto => {
      const sue = perVoce.get(v.id) ?? [];
      const reale = somma(sue.map((r) => r.importo));
      const aFinire = arrotonda(aFinireVoce(v.importo, reale, v.aFinire) * fattore(v.tipo));
      const stima = arrotonda(reale + aFinire);
      const origine = approvate ? approvatePerId.get(v.origineId ?? "") ?? approvatePerId.get(v.id) ?? null : null;
      return {
        chiave: v.id,
        voce: v,
        tipo: v.tipo,
        etichetta: v.descrizione || CATEGORIE_PIANO[v.categoria]?.nome || "Voce",
        categoria: v.categoria,
        previsto: arrotonda(v.importo),
        approvato: origine ? arrotonda(origine.importo) : null,
        reale,
        aFinire,
        aFinireManuale: v.aFinire !== null,
        stima,
        scostamento: arrotonda(stima - v.importo),
        righe: sue,
      };
    });

  const fuoriPiano: RigaConfronto[] = [...fuori.entries()]
    .map(([chiave, sue]): RigaConfronto => {
      const reale = somma(sue.map((r) => r.importo));
      const parola = sue[0].chiave;
      return {
        chiave,
        voce: null,
        tipo: sue[0].tipo,
        etichetta: `Fuori piano · ${CHIAVI_REALI[parola] ?? parola}`,
        categoria: parola,
        previsto: 0,
        approvato: null,
        reale,
        aFinire: 0,
        aFinireManuale: false,
        stima: reale,
        scostamento: reale,
        righe: sue,
      };
    })
    .sort((a, b) => Math.abs(b.reale) - Math.abs(a.reale));

  const tutte = [...dalleVoci, ...fuoriPiano];
  const ricavi = tutte.filter((r) => r.tipo === "ricavo");
  const costi = tutte.filter((r) => r.tipo === "costo");
  const totApprovato = (tipo: TipoVoce) =>
    approvate ? somma(approvate.filter((a) => a.tipo === tipo).map((a) => a.importo)) : null;
  const tRicavi = totaliDi(ricavi, totApprovato("ricavo"));
  const tCosti = totaliDi(costi, totApprovato("costo"));
  const margine: TotaliColonne = {
    previsto: arrotonda(tRicavi.previsto - tCosti.previsto),
    approvato: tRicavi.approvato !== null && tCosti.approvato !== null ? arrotonda(tRicavi.approvato - tCosti.approvato) : null,
    reale: arrotonda(tRicavi.reale - tCosti.reale),
    aFinire: arrotonda(tRicavi.aFinire - tCosti.aFinire),
    stima: arrotonda(tRicavi.stima - tCosti.stima),
    scostamento: arrotonda(tRicavi.scostamento - tCosti.scostamento),
  };
  const copiate = new Set(voci.map((v) => v.origineId).filter(Boolean));
  const vociTolte = (approvate ?? []).filter((a) => !copiate.has(a.id) && !idVoci.has(a.id));
  return { ricavi, costi, totali: { ricavi: tRicavi, costi: tCosti, margine }, vociTolte };
}

// ── Flusso di cassa ────────────────────────────────────────────────────────

export interface PartitaCassa {
  etichetta: string;
  tipo: TipoVoce;
  importo: number;
  origine: "previsto" | "reale" | "a_finire" | "da_incassare";
}

export interface MeseCassa {
  mese: Mese;
  entrate: number;
  uscite: number;
  netto: number;
  cumulato: number;
  /** Il mese è prima di quello di oggi: solo reale. */
  passato: boolean;
  partite: PartitaCassa[];
}

/** Mette in fila i mesi, dal primo all'ultimo senza buchi, e fa il cumulato. */
export function serieMensile(partite: { mese: Mese; partita: PartitaCassa }[], oggi: Mese): MeseCassa[] {
  if (partite.length === 0) return [];
  const mesi = partite.map((p) => p.mese).sort();
  const primo = mesi[0];
  const quanti = distanzaMesi(primo, mesi[mesi.length - 1]) + 1;
  const perMese = new Map<Mese, PartitaCassa[]>();
  for (const p of partite) perMese.set(p.mese, [...(perMese.get(p.mese) ?? []), p.partita]);
  let cumulato = 0;
  return Array.from({ length: quanti }, (_, i) => {
    const mese = aggiungiMesi(primo, i);
    const sue = perMese.get(mese) ?? [];
    const entrate = somma(sue.filter((p) => p.tipo === "ricavo").map((p) => p.importo));
    const uscite = somma(sue.filter((p) => p.tipo === "costo").map((p) => p.importo));
    const netto = arrotonda(entrate - uscite);
    cumulato = arrotonda(cumulato + netto);
    return { mese, entrate, uscite, netto, cumulato, passato: mese < oggi, partite: sue };
  });
}

/** Il flusso del piano com'è scritto: ogni voce col suo mese, divisa sulla sua durata. Le voci senza mese non entrano. */
export function flussoPrevisto(voci: VocePiano[], oggi: Mese): MeseCassa[] {
  const partite = voci
    .filter((v) => v.mese && v.importo !== 0)
    .flatMap((v) => distribuisci(v.importo, v.mese!, v.durataMesi).map((q) => ({
      mese: q.mese,
      partita: { etichetta: v.descrizione || CATEGORIE_PIANO[v.categoria].nome, tipo: v.tipo, importo: q.importo, origine: "previsto" as const },
    })));
  return serieMensile(partite, oggi);
}

export interface OpzioniStima {
  /** Gli incassi che mancano arrivano n mesi dopo il previsto. */
  ritardoMesi?: number;
}

/**
 * Il flusso della stima: il reale nei mesi in cui è avvenuto (costi alla data della spesa,
 * ricavi alla data dell'incasso), le fatture non ancora incassate il mese prossimo, e
 * l'a finire di ogni voce sui suoi mesi che non sono ancora passati (se sono tutti passati,
 * in questo mese). Le voci senza mese non entrano: lo dice un avviso.
 */
export function flussoStima(
  confronto: Confronto,
  righe: RigaReale[],
  incassi: Incasso[],
  oggi: Mese,
  opzioni: OpzioniStima = {},
): MeseCassa[] {
  const partite: { mese: Mese; partita: PartitaCassa }[] = [];
  for (const r of righe.filter((x) => x.tipo === "costo")) {
    partite.push({ mese: meseDi(r.data, oggi), partita: { etichetta: r.descrizione, tipo: "costo", importo: r.importo, origine: "reale" } });
  }
  for (const i of incassi) {
    partite.push({ mese: meseDi(i.data, oggi), partita: { etichetta: "Incasso", tipo: "ricavo", importo: i.importo, origine: "reale" } });
  }
  const fatturato = somma(righe.filter((x) => x.tipo === "ricavo").map((x) => x.importo));
  const daIncassare = arrotonda(fatturato - somma(incassi.map((i) => i.importo)));
  if (daIncassare > 0) {
    partite.push({
      mese: aggiungiMesi(oggi, 1 + (opzioni.ritardoMesi ?? 0)),
      partita: { etichetta: "Fatture da incassare", tipo: "ricavo", importo: daIncassare, origine: "da_incassare" },
    });
  }
  for (const r of [...confronto.ricavi, ...confronto.costi]) {
    const v = r.voce;
    if (!v || !v.mese || r.aFinire === 0) continue;
    const finestra = Array.from({ length: Math.max(1, v.durataMesi) }, (_, i) => aggiungiMesi(v.mese!, i));
    const future = finestra.filter((m) => m >= oggi);
    const ritardo = v.tipo === "ricavo" ? opzioni.ritardoMesi ?? 0 : 0;
    const inizio = aggiungiMesi(future[0] ?? oggi, ritardo);
    for (const q of distribuisci(r.aFinire, inizio, future.length || 1)) {
      partite.push({ mese: q.mese, partita: { etichetta: r.etichetta, tipo: v.tipo, importo: q.importo, origine: "a_finire" } });
    }
  }
  return serieMensile(partite, oggi);
}

/** Il punto più basso della cassa cumulata: quanto capitale serve al massimo, e quando. */
export function capitaleMassimo(serie: MeseCassa[]): { importo: number; mese: Mese | null } {
  let minimo = 0;
  let mese: Mese | null = null;
  for (const m of serie) {
    if (m.cumulato < minimo) {
      minimo = m.cumulato;
      mese = m.mese;
    }
  }
  return { importo: Math.max(0, arrotonda(-minimo)), mese };
}

/** Il capitale investito a oggi: costi registrati meno incassi, mai sotto zero (stessa regola della fotografia). */
export function capitaleInvestitoOggi(righe: RigaReale[], incassi: Incasso[]): number {
  const costi = somma(righe.filter((r) => r.tipo === "costo").map((r) => r.importo));
  return arrotonda(Math.max(0, costi - somma(incassi.map((i) => i.importo))));
}

// ── Rendimento ─────────────────────────────────────────────────────────────

/** Valore attuale dei flussi mensili al tasso mensile r. */
export function valoreAttuale(flussi: number[], r: number): number {
  return flussi.reduce((t, f, i) => t + f / Math.pow(1 + r, i), 0);
}

/**
 * TIR mensile: il tasso che azzera il valore attuale. Null se i flussi non cambiano mai segno
 * (nessun investimento o nessun ritorno) o se non si trova un tasso sensato.
 */
export function tirMensile(flussi: number[]): number | null {
  if (!flussi.some((f) => f < 0) || !flussi.some((f) => f > 0)) return null;
  let basso = -0.9999;
  let alto = 1;
  let vBasso = valoreAttuale(flussi, basso);
  let vAlto = valoreAttuale(flussi, alto);
  while (Math.sign(vBasso) === Math.sign(vAlto) && alto < 1e4) {
    alto *= 2;
    vAlto = valoreAttuale(flussi, alto);
  }
  if (!Number.isFinite(vBasso) || !Number.isFinite(vAlto) || Math.sign(vBasso) === Math.sign(vAlto)) return null;
  for (let i = 0; i < 300 && alto - basso > 1e-12; i++) {
    const medio = (basso + alto) / 2;
    const vMedio = valoreAttuale(flussi, medio);
    if (vMedio === 0) return medio;
    if (Math.sign(vMedio) === Math.sign(vBasso)) {
      basso = medio;
      vBasso = vMedio;
    } else {
      alto = medio;
    }
  }
  return (basso + alto) / 2;
}

/** TIR annuo (rendimento annuo composto) dai flussi mensili. */
export function tirAnnuo(flussi: number[]): number | null {
  const r = tirMensile(flussi);
  if (r === null) return null;
  const annuo = Math.pow(1 + r, 12) - 1;
  return Number.isFinite(annuo) && Math.abs(annuo) < 1e4 ? annuo : null;
}

export interface Indicatori {
  ricavi: number;
  costi: number;
  margine: number;
  /** Margine sui ricavi. */
  marginePct: number | null;
  /** Margine sui costi: quanto rende ogni euro speso. */
  roi: number | null;
  tir: number | null;
  /** Mesi dal primo all'ultimo movimento di cassa. */
  durataMesi: number | null;
  inizio: Mese | null;
  fine: Mese | null;
  capitaleMassimo: number;
  meseCapitaleMassimo: Mese | null;
  mq: number | null;
  /** Costi di cantiere al m². */
  costoMq: number | null;
  /** Ricavi al m². */
  prezzoMq: number | null;
  /** Il prezzo medio al m² a cui i ricavi pagano tutti i costi. */
  pareggioMq: number | null;
}

export function indicatori(
  totali: { ricavi: number; costi: number; costiCantiere: number },
  serie: MeseCassa[],
  mq: number | null,
): Indicatori {
  const margine = arrotonda(totali.ricavi - totali.costi);
  const attivi = serie.filter((m) => m.entrate !== 0 || m.uscite !== 0);
  const inizio = attivi[0]?.mese ?? null;
  const fine = attivi[attivi.length - 1]?.mese ?? null;
  const daInizio = inizio ? serie.slice(serie.findIndex((m) => m.mese === inizio)) : [];
  const picco = capitaleMassimo(serie);
  const conMq = mq !== null && mq > 0 ? mq : null;
  return {
    ricavi: totali.ricavi,
    costi: totali.costi,
    margine,
    marginePct: totali.ricavi > 0 ? margine / totali.ricavi : null,
    roi: totali.costi > 0 ? margine / totali.costi : null,
    tir: tirAnnuo(daInizio.map((m) => m.netto)),
    durataMesi: inizio && fine ? distanzaMesi(inizio, fine) + 1 : null,
    inizio,
    fine,
    capitaleMassimo: picco.importo,
    meseCapitaleMassimo: picco.mese,
    mq: conMq,
    costoMq: conMq ? arrotonda(totali.costiCantiere / conMq) : null,
    prezzoMq: conMq ? arrotonda(totali.ricavi / conMq) : null,
    pareggioMq: conMq ? arrotonda(totali.costi / conMq) : null,
  };
}

// ── Costi comuni ───────────────────────────────────────────────────────────

export interface FigliaRipartizione { id: string; nome: string; importo: number | null }
export interface DatiUnita { mq: number | null; millesimi: number | null }
export type CriterioRipartizione = "millesimi" | "mq" | "importo" | "parti_uguali";

export interface QuotaFiglia { figliaId: string; nome: string; base: number; quota: number; importo: number }

export interface Ripartizione {
  criterio: CriterioRipartizione;
  /** Perché questo criterio, detto a chi legge. */
  motivo: string;
  quote: QuotaFiglia[];
}

const CRITERI: Record<CriterioRipartizione, string> = {
  millesimi: "per millesimi",
  mq: "per m² commerciali",
  importo: "in proporzione all'importo",
  parti_uguali: "in parti uguali",
};
export const nomeCriterio = (c: CriterioRipartizione) => CRITERI[c];

/** Divide `totale` secondo i pesi, al centesimo: i centesimi avanzati vanno ai resti più grandi. */
export function dividiAlCentesimo(totale: number, pesi: number[]): number[] {
  const somma = pesi.reduce((t, p) => t + p, 0);
  if (pesi.length === 0 || somma <= 0) return pesi.map(() => 0);
  const centesimi = Math.round(totale * 100);
  const esatti = pesi.map((p) => (centesimi * p) / somma);
  const interi = esatti.map((e) => Math.floor(e));
  let avanzo = centesimi - interi.reduce((t, v) => t + v, 0);
  const ordine = esatti.map((e, i) => ({ i, resto: e - Math.floor(e) })).sort((a, b) => b.resto - a.resto || a.i - b.i);
  for (const { i } of ordine) {
    if (avanzo <= 0) break;
    interi[i] += 1;
    avanzo -= 1;
  }
  return interi.map((c) => c / 100);
}

/**
 * I costi registrati sulla generale divisi sulle figlie, in lettura: per millesimi se ogni
 * figlia li ha, altrimenti per m², altrimenti per importo, altrimenti in parti uguali.
 */
export function ripartisciCostiComuni(
  figlie: FigliaRipartizione[],
  unita: ReadonlyMap<string, DatiUnita> | null,
  totale: number,
): Ripartizione {
  if (figlie.length === 0) return { criterio: "parti_uguali", motivo: "Non ci sono commesse dentro questa generale.", quote: [] };
  const valore = (f: FigliaRipartizione, campo: "millesimi" | "mq") => {
    const v = unita?.get(f.id)?.[campo];
    return v !== null && v !== undefined && Number.isFinite(v) && v > 0 ? v : null;
  };
  const mancanti = (campo: "millesimi" | "mq") => figlie.filter((f) => valore(f, campo) === null).length;
  const note: string[] = [];
  let criterio: CriterioRipartizione;
  let pesi: number[];
  if (mancanti("millesimi") === 0) {
    criterio = "millesimi";
    pesi = figlie.map((f) => valore(f, "millesimi")!);
  } else {
    if (mancanti("millesimi") < figlie.length) note.push(`mancano i millesimi di ${mancanti("millesimi")} su ${figlie.length}`);
    if (mancanti("mq") === 0) {
      criterio = "mq";
      pesi = figlie.map((f) => valore(f, "mq")!);
    } else {
      if (mancanti("mq") < figlie.length) note.push(`mancano i m² di ${mancanti("mq")} su ${figlie.length}`);
      const importi = figlie.map((f) => Math.max(0, f.importo ?? 0));
      if (importi.some((i) => i > 0)) {
        criterio = "importo";
        pesi = importi;
      } else {
        criterio = "parti_uguali";
        pesi = figlie.map(() => 1);
        note.push("nessuna ha un importo");
      }
    }
  }
  const importi = dividiAlCentesimo(totale, pesi);
  const totPesi = pesi.reduce((t, p) => t + p, 0);
  const motivo = `Ripartiti ${CRITERI[criterio]}${note.length ? ` (${note.join("; ")})` : ""}.`;
  return {
    criterio,
    motivo,
    quote: figlie.map((f, i) => ({
      figliaId: f.id,
      nome: f.nome,
      base: pesi[i],
      quota: totPesi > 0 ? pesi[i] / totPesi : 0,
      importo: importi[i],
    })),
  };
}

// ── Tutto insieme ──────────────────────────────────────────────────────────

export interface Scenario {
  /** Prezzi di vendita più bassi del x% (sui ricavi che mancano). */
  prezzoPct: number;
  /** Incassi che mancano n mesi più tardi. */
  ritardoMesi: number;
  /** Costi che mancano più alti del y%. */
  costiPct: number;
}

export const scenarioNeutro = (s: Scenario | null | undefined) =>
  !s || (s.prezzoPct === 0 && s.ritardoMesi === 0 && s.costiPct === 0);

export interface InputPiano {
  /** Oggi, «2026-10-30» o «2026-10». */
  oggi: string;
  generaleId: string;
  voci: VocePiano[];
  /** Le voci dell'approvato, quando si guarda una revisione. */
  approvate?: VocePiano[] | null;
  righe: RigaReale[];
  incassi: Incasso[];
  figlie: FigliaRipartizione[];
  /** Millesimi e m² delle unità (modulo Unità), per figlia. */
  unita?: ReadonlyMap<string, DatiUnita> | null;
  scenario?: Scenario | null;
}

export interface PianoCalcolato {
  oggi: Mese;
  confronto: Confronto;
  cassa: { previsto: MeseCassa[]; stima: MeseCassa[]; scenario: MeseCassa[] | null };
  indicatori: { previsto: Indicatori; stima: Indicatori; scenario: Indicatori | null };
  /** Stima finale con lo scenario: righe e totali. */
  confrontoScenario: Confronto | null;
  capitale: { massimoPrevisto: number; massimoStima: number; meseMassimoStima: Mese | null; investitoOggi: number };
  costiComuni: { totale: number; righe: RigaReale[]; ripartizione: Ripartizione };
  /** Cosa manca perché i numeri siano completi (voci senza mese, reale fuori piano). */
  avvisi: string[];
  mq: number | null;
}

const costiCantiere = (c: Confronto, colonna: "previsto" | "stima") =>
  somma(c.costi.filter((r) => CATEGORIE_CANTIERE.has(r.categoria)).map((r) => r[colonna]));

/** Tutti i numeri del piano in una chiamata: la pagina, il riquadro in Panoramica e gli investitori. */
export function calcolaPianoEconomico(input: InputPiano): PianoCalcolato {
  const oggi = meseDi(input.oggi, input.oggi.slice(0, 7));
  const confronto = confrontoVoci(input.voci, input.righe, input.approvate ?? null);
  const mqTotali = (() => {
    if (!input.unita) return null;
    const valori = input.figlie.map((f) => input.unita!.get(f.id)?.mq ?? null);
    const presenti = valori.filter((v): v is number => v !== null && Number.isFinite(v) && v > 0);
    return presenti.length > 0 ? somma(presenti) : null;
  })();

  const cassaPrevista = flussoPrevisto(input.voci, oggi);
  const cassaStima = flussoStima(confronto, input.righe, input.incassi, oggi);
  const indPrevisto = indicatori(
    { ricavi: confronto.totali.ricavi.previsto, costi: confronto.totali.costi.previsto, costiCantiere: costiCantiere(confronto, "previsto") },
    cassaPrevista, mqTotali,
  );
  const indStima = indicatori(
    { ricavi: confronto.totali.ricavi.stima, costi: confronto.totali.costi.stima, costiCantiere: costiCantiere(confronto, "stima") },
    cassaStima, mqTotali,
  );

  let confrontoScenario: Confronto | null = null;
  let cassaScenario: MeseCassa[] | null = null;
  let indScenario: Indicatori | null = null;
  if (!scenarioNeutro(input.scenario)) {
    const s = input.scenario!;
    confrontoScenario = confrontoVoci(input.voci, input.righe, input.approvate ?? null, { prezzoPct: s.prezzoPct, costiPct: s.costiPct });
    cassaScenario = flussoStima(confrontoScenario, input.righe, input.incassi, oggi, { ritardoMesi: s.ritardoMesi });
    indScenario = indicatori(
      {
        ricavi: confrontoScenario.totali.ricavi.stima,
        costi: confrontoScenario.totali.costi.stima,
        costiCantiere: costiCantiere(confrontoScenario, "stima"),
      },
      cassaScenario, mqTotali,
    );
  }

  const righeComuni = input.righe.filter((r) => r.tipo === "costo" && r.orderId === input.generaleId);
  const totaleComuni = somma(righeComuni.map((r) => r.importo));

  const avvisi: string[] = [];
  const senzaMese = input.voci.filter((v) => !v.mese && v.importo > 0);
  if (senzaMese.length > 0) {
    avvisi.push(senzaMese.length === 1
      ? `«${senzaMese[0].descrizione || CATEGORIE_PIANO[senzaMese[0].categoria].nome}» non ha il mese: non entra nel flusso di cassa né nel rendimento.`
      : `${senzaMese.length} voci non hanno il mese: non entrano nel flusso di cassa né nel rendimento.`);
  }
  const fuori = [...confronto.costi, ...confronto.ricavi].filter((r) => r.voce === null);
  if (fuori.length > 0) {
    const tot = somma(fuori.map((r) => Math.abs(r.reale)));
    avvisi.push(`${fuori.length === 1 ? "Una parte" : `${fuori.length} parti`} del reale (${tot.toLocaleString("it-IT", { maximumFractionDigits: 0 })} €) non ha una voce nel piano: aggiungila o aggancia la categoria a una voce.`);
  }

  const picco = capitaleMassimo(cassaStima);
  return {
    oggi,
    confronto,
    cassa: { previsto: cassaPrevista, stima: cassaStima, scenario: cassaScenario },
    indicatori: { previsto: indPrevisto, stima: indStima, scenario: indScenario },
    confrontoScenario,
    capitale: {
      massimoPrevisto: capitaleMassimo(cassaPrevista).importo,
      massimoStima: picco.importo,
      meseMassimoStima: picco.mese,
      investitoOggi: capitaleInvestitoOggi(input.righe, input.incassi),
    },
    costiComuni: {
      totale: totaleComuni,
      righe: righeComuni,
      ripartizione: ripartisciCostiComuni(input.figlie, input.unita ?? null, totaleComuni),
    },
    avvisi,
    mq: mqTotali,
  };
}

export interface NumeriInvestitori {
  /** Il punto più basso della cassa nella stima: il capitale che l'operazione chiede. */
  capitaleMassimoImpegnato: number;
  meseCapitaleMassimo: Mese | null;
  /** Costi registrati meno incassi, a oggi. */
  capitaleInvestitoOggi: number;
  previsto: { ricavi: number; costi: number; margine: number };
  stimaFinale: { ricavi: number; costi: number; margine: number };
  tirAnnuo: number | null;
  durataMesi: number | null;
  /** La cassa mese per mese della stima. */
  flussoMensile: { mese: Mese; entrate: number; uscite: number; netto: number; cumulato: number }[];
}

/** I numeri che servono a chi rende conto agli investitori (modulo Fonti e investitori). */
export function numeriPerInvestitori(p: PianoCalcolato): NumeriInvestitori {
  const t = p.confronto.totali;
  return {
    capitaleMassimoImpegnato: p.capitale.massimoStima,
    meseCapitaleMassimo: p.capitale.meseMassimoStima,
    capitaleInvestitoOggi: p.capitale.investitoOggi,
    previsto: { ricavi: t.ricavi.previsto, costi: t.costi.previsto, margine: t.margine.previsto },
    stimaFinale: { ricavi: t.ricavi.stima, costi: t.costi.stima, margine: t.margine.stima },
    tirAnnuo: p.indicatori.stima.tir,
    durataMesi: p.indicatori.stima.durataMesi,
    flussoMensile: p.cassa.stima.map(({ mese, entrate, uscite, netto, cumulato }) => ({ mese, entrate, uscite, netto, cumulato })),
  };
}
