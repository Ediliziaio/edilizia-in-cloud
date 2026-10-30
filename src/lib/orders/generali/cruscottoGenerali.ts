// src/lib/orders/generali/cruscottoGenerali.ts
// Le commesse generali nel cruscotto aziendale: il portafoglio dei contratti
// (appalti) e le operazioni immobiliari (sviluppo, compravendita).
//
// Nessun conto nuovo: `cruscotto_commesse_generali` restituisce, per ogni
// generale, le stesse risposte che legge la sua pagina (riepilogo, unità, piano
// in breve) e qui si usano le stesse funzioni della pagina: totaliGenerale e
// riepilogoVendite. Il piano in breve è quello delle fotografie mensili
// (generale_piano_numeri): stima finale e capitale investito a oggi.
import {
  leggiRiepilogo, totaliGenerale, isModelloGenerale,
  type ModelloGenerale, type RiepilogoGenerale, type TotaliGenerale,
} from "@/lib/orders/commesseGenerali";
import { leggiElencoUnita } from "@/lib/orders/generali/unita";
import { riepilogoVendite, type RiepilogoVendite } from "@/lib/orders/generali/unitaConti";

const arrotonda = (n: number) => Math.round(n * 100) / 100;
const numero = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

export interface PianoInBreve {
  versione: number | null;
  stato: string | null;
  ricaviPrevisti: number;
  costiPrevisti: number;
  ricaviStima: number;
  costiStima: number;
  /** Ricavi meno costi della stima finale: dove arriverà il margine a lavori finiti. */
  margineAFinire: number;
  /** Costi registrati meno incassi, a oggi. */
  capitaleImpegnato: number;
  capitaleMassimoPrevisto: number;
}

/** Legge la risposta di `generale_piano_numeri`; null = piano non impostato (o non visibile). */
export function leggiPianoInBreve(v: unknown): PianoInBreve | null {
  const d = v as Record<string, unknown> | null;
  if (!d || typeof d !== "object" || !("ricavi_stima" in d)) return null;
  const n = (k: string) => numero(d[k]) ?? 0;
  return {
    versione: numero(d.versione_numero),
    stato: typeof d.versione_stato === "string" ? d.versione_stato : null,
    ricaviPrevisti: n("ricavi_previsti"),
    costiPrevisti: n("costi_previsti"),
    ricaviStima: n("ricavi_stima"),
    costiStima: n("costi_stima"),
    margineAFinire: arrotonda(n("ricavi_stima") - n("costi_stima")),
    capitaleImpegnato: n("capitale_investito"),
    capitaleMassimoPrevisto: n("capitale_massimo_previsto"),
  };
}

export interface RigaAppalto {
  id: string;
  codice: string | null;
  nome: string;
  cliente: string | null;
  /** Il valore del contratto con atti e varianti (o, senza, la somma degli ordini dentro). */
  valore: number | null;
  eseguito: number | null;
  daEseguire: number | null;
  fatturato: number | null;
  daIncassare: number | null;
  avanzamento: number;
  /** null = piano non impostato o margini non visibili. */
  margineAFinire: number | null;
  piano: boolean;
}

export interface RigaOperazione {
  id: string;
  codice: string | null;
  nome: string;
  modello: ModelloGenerale;
  unita: number;
  vendute: number;
  libere: number;
  venduto: number | null;
  incassato: number | null;
  capitaleImpegnato: number | null;
  margineAFinire: number | null;
  piano: boolean;
}

export interface TotaleAppalti {
  appalti: number;
  valore: number | null;
  eseguito: number | null;
  daEseguire: number | null;
  fatturato: number | null;
  daIncassare: number | null;
  /** Somma dei soli appalti con il piano; `conPiano` dice quanti sono. */
  margineAFinire: number | null;
  conPiano: number;
}

export interface TotaleOperazioni {
  operazioni: number;
  unita: number;
  vendute: number;
  libere: number;
  venduto: number | null;
  incassato: number | null;
  capitaleImpegnato: number | null;
  margineAFinire: number | null;
  conPiano: number;
}

export interface CruscottoGenerali {
  /** L'azienda ha acceso almeno un modello di commessa generale. */
  attiva: boolean;
  permessi: { importi: boolean; costi: boolean; margini: boolean };
  appalti: RigaAppalto[];
  operazioni: RigaOperazione[];
  totaleAppalti: TotaleAppalti;
  totaleOperazioni: TotaleOperazioni;
  /** Generali in corso che non si sono potute leggere (i loro numeri mancano dai totali). */
  nonLette: number;
}

/** Somma; null se chi guarda non vede anche una sola delle parti. */
const somma = (valori: (number | null)[]): number | null =>
  valori.some((v) => v === null) ? null : arrotonda(valori.reduce<number>((t, v) => t + (v ?? 0), 0));
/** Somma delle sole righe che hanno il numero (il margine dei piani impostati); null se nessuna. */
const sommaPresenti = (valori: (number | null)[]): number | null => {
  const presenti = valori.filter((v): v is number => v !== null);
  return presenti.length > 0 ? arrotonda(presenti.reduce((t, v) => t + v, 0)) : null;
};

function rigaAppalto(r: RiepilogoGenerale, t: TotaliGenerale, piano: PianoInBreve | null): RigaAppalto {
  return {
    id: r.generale.id,
    codice: r.generale.codice,
    nome: r.generale.nome,
    cliente: r.generale.cliente,
    valore: t.base,
    eseguito: t.eseguito,
    daEseguire: t.base !== null && t.eseguito !== null ? arrotonda(Math.max(0, t.base - t.eseguito)) : null,
    fatturato: t.fatturato,
    daIncassare: t.daIncassare,
    avanzamento: t.avanzamento,
    margineAFinire: piano?.margineAFinire ?? null,
    piano: !!piano,
  };
}

function rigaOperazione(r: RiepilogoGenerale, v: RiepilogoVendite | null, piano: PianoInBreve | null): RigaOperazione {
  return {
    id: r.generale.id,
    codice: r.generale.codice,
    nome: r.generale.nome,
    modello: r.generale.modello,
    unita: v?.unita ?? 0,
    vendute: v ? v.conteggi.compromesso + v.conteggi.rogitata : 0,
    libere: v?.conteggi.libera ?? 0,
    venduto: v?.venduto ?? null,
    incassato: v?.incassato ?? null,
    capitaleImpegnato: piano?.capitaleImpegnato ?? null,
    margineAFinire: piano?.margineAFinire ?? null,
    piano: !!piano,
  };
}

/** Legge la risposta di `cruscotto_commesse_generali` senza fidarsi della forma. Solo le generali in corso. */
export function leggiCruscottoGenerali(data: unknown): CruscottoGenerali | null {
  const d = data as Record<string, unknown> | null;
  if (!d || typeof d !== "object" || !Array.isArray(d.generali)) return null;
  const p = (d.permessi ?? {}) as Record<string, unknown>;
  const permessi = { importi: p.importi === true, costi: p.costi === true, margini: p.margini === true };
  const appalti: RigaAppalto[] = [];
  const operazioni: RigaOperazione[] = [];
  let nonLette = 0;

  for (const e of d.generali as Record<string, unknown>[]) {
    if (!e || typeof e !== "object" || e.in_corso === false) continue;
    const r = leggiRiepilogo(e.riepilogo);
    if (!r || typeof e.errore === "string") {
      nonLette += 1;
      continue;
    }
    // Il modello lo dice la riga del cruscotto; il riepilogo lo ripete.
    if (isModelloGenerale(e.modello)) r.generale.modello = e.modello;
    const piano = leggiPianoInBreve(e.piano);
    if (r.generale.modello === "appalto") {
      appalti.push(rigaAppalto(r, totaliGenerale(r), piano));
    } else {
      const elenco = leggiElencoUnita(e.unita);
      operazioni.push(rigaOperazione(r, elenco ? riepilogoVendite(elenco) : null, piano));
    }
  }

  const perCodice = <T extends { codice: string | null; nome: string }>(a: T, b: T) =>
    (a.codice ?? a.nome).localeCompare(b.codice ?? b.nome, "it", { numeric: true });
  appalti.sort(perCodice);
  operazioni.sort(perCodice);

  return {
    attiva: d.attiva === true,
    permessi,
    appalti,
    operazioni,
    totaleAppalti: {
      appalti: appalti.length,
      valore: somma(appalti.map((a) => a.valore)),
      eseguito: somma(appalti.map((a) => a.eseguito)),
      daEseguire: somma(appalti.map((a) => a.daEseguire)),
      fatturato: somma(appalti.map((a) => a.fatturato)),
      daIncassare: somma(appalti.map((a) => a.daIncassare)),
      margineAFinire: sommaPresenti(appalti.map((a) => a.margineAFinire)),
      conPiano: appalti.filter((a) => a.piano).length,
    },
    totaleOperazioni: {
      operazioni: operazioni.length,
      unita: operazioni.reduce((t, o) => t + o.unita, 0),
      vendute: operazioni.reduce((t, o) => t + o.vendute, 0),
      libere: operazioni.reduce((t, o) => t + o.libere, 0),
      venduto: somma(operazioni.map((o) => o.venduto)),
      incassato: somma(operazioni.map((o) => o.incassato)),
      capitaleImpegnato: sommaPresenti(operazioni.map((o) => o.capitaleImpegnato)),
      margineAFinire: sommaPresenti(operazioni.map((o) => o.margineAFinire)),
      conPiano: operazioni.filter((o) => o.piano).length,
    },
    nonLette,
  };
}
