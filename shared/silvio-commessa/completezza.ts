/**
 * Punteggio di completezza di una commessa (31/10/2026, fase 0, lotto 0.2).
 * Vedi docs/piano-silvio-commessa-ai.md, sezione 6, Fase 0.
 *
 * 0–100, calcolato dal registro: la somma dei pesi delle variabili compilate sul
 * totale dei pesi, più l'elenco di cosa manca. Tre strade, stessa regola:
 * - `completezza(dati)` su una commessa vera (colonne di `orders` + righe collegate);
 * - `completezzaPiano(piano)` sulla bozza del popup;
 * - `sqlPunteggio()` / `sqlCompilata()` / `sqlMancano()` per misurare nel database
 *   (quadro_commessa, la query di partenza della fase 0, `commesse_da_completare` della
 *   fase 2: un test controlla che la migrazione usi queste stesse espressioni).
 *
 * Senza dipendenze, compatibile con Deno.
 */
import { AREE, type Area, type PianoCommessa } from "./piano.ts";
import { REGISTRO, type Variabile } from "./registro.ts";

/** Una commessa vera: la riga di `orders` e quante righe ha nelle tabelle collegate. */
export interface DatiCommessa {
  order: Record<string, unknown>;
  /** Chiave da `chiaveRighe(tabella, conColonna?)` → numero di righe. Se manca vale 0. */
  righe: Record<string, number>;
}

export interface Completezza {
  /** 0–100. */
  punteggio: number;
  /** Variabili col peso, compilate. */
  compilate: Variabile[];
  /** Variabili col peso che mancano, dalla più pesante. */
  mancano: Variabile[];
  /** Solo per la bozza: variabili con un conflitto aperto (compilate, ma da decidere). */
  daDecidere: Variabile[];
  /** Per area: punteggio (null se nell'area niente ha peso) e chiavi che mancano. */
  perArea: Record<Area, { punteggio: number | null; mancano: string[] }>;
}

export function chiaveRighe(tabella: string, conColonna?: string): string {
  return conColonna ? `${tabella}.${conColonna}` : tabella;
}

function pieno(v: unknown, regola: "presente" | "positivo"): boolean {
  if (regola === "positivo") return typeof v === "number" ? v > 0 : Number(v) > 0;
  if (v == null) return false;
  if (typeof v === "string") return v.trim() !== "";
  return true;
}

/** La variabile è compilata su questa commessa? */
export function compilata(v: Variabile, dati: DatiCommessa): boolean {
  const c = v.controllo;
  if (c.tipo === "colonne") return c.colonne.some((col) => pieno(dati.order[col], c.regola));
  return c.tabelle.some((t) => (dati.righe[chiaveRighe(t, c.conColonna)] ?? 0) > 0);
}

function riassumi(esito: Map<Variabile, boolean>, daDecidere: Variabile[] = []): Completezza {
  const conPeso = REGISTRO.filter((v) => v.peso > 0);
  const compilate = conPeso.filter((v) => esito.get(v));
  const mancano = conPeso.filter((v) => !esito.get(v)).sort((a, b) => b.peso - a.peso);
  const somma = (vs: Variabile[]) => vs.reduce((s, v) => s + v.peso, 0);
  const totale = somma(conPeso);

  const perArea = {} as Completezza["perArea"];
  for (const area of AREE) {
    const tot = somma(conPeso.filter((v) => v.area === area));
    perArea[area] = {
      punteggio: tot > 0 ? Math.round((100 * somma(compilate.filter((v) => v.area === area))) / tot) : null,
      mancano: mancano.filter((v) => v.area === area).map((v) => v.chiave),
    };
  }
  return {
    punteggio: totale > 0 ? Math.round((100 * somma(compilate)) / totale) : 0,
    compilate, mancano, daDecidere, perArea,
  };
}

/** Il punteggio di una commessa vera. */
export function completezza(dati: DatiCommessa): Completezza {
  return riassumi(new Map(REGISTRO.map((v) => [v, compilata(v, dati)])));
}

function valorePieno(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

/**
 * Il punteggio della bozza. Una variabile è compilata se il piano ha un valore non vuoto
 * (e non in stato «manca»). Le variabili «righe con una colonna» (le date delle fasi)
 * si leggono nella lista della stessa tabella: una fase con `start_date` basta.
 */
export function completezzaPiano(piano: PianoCommessa): Completezza {
  const valore = (v: Variabile) => {
    const x = piano.aree[v.area]?.[v.chiave];
    return x && x.stato !== "manca" ? x.valore : undefined;
  };
  const esito = new Map<Variabile, boolean>();
  for (const v of REGISTRO) {
    const c = v.controllo;
    let ok: boolean;
    if (c.tipo === "colonne") {
      const x = valore(v);
      ok = c.regola === "positivo" ? pieno(x, "positivo") : valorePieno(x);
    } else if (c.conColonna && valore(v) === undefined) {
      const lista = REGISTRO.find((w) => w !== v && w.area === v.area && w.controllo.tipo === "righe"
        && !w.controllo.conColonna && w.controllo.tabelle.join() === c.tabelle.join());
      const elementi = lista ? valore(lista) : undefined;
      ok = Array.isArray(elementi)
        && elementi.some((e) => valorePieno((e as Record<string, unknown> | null)?.[c.conColonna!]));
    } else {
      ok = valorePieno(valore(v));
    }
    esito.set(v, ok);
  }
  const daDecidere = REGISTRO.filter((v) => piano.conflitti.some((c) => c.area === v.area && c.chiave === v.chiave));
  return riassumi(esito, daDecidere);
}

// ── SQL, dallo stesso registro ──────────────────────────────────────────────

const NOME = /^[a-z_][a-z0-9_]*$/;
function nome(n: string): string {
  if (!NOME.test(n)) throw new Error(`Nome SQL non valido: ${n}`);
  return n;
}

/** Espressione booleana: la variabile è compilata sulla commessa `alias` (una riga di orders). */
export function sqlCompilata(v: Variabile, alias = "o"): string {
  const a = nome(alias);
  const c = v.controllo;
  if (c.tipo === "colonne") {
    const parti = c.colonne.map((col) => c.regola === "positivo"
      ? `coalesce(${a}.${nome(col)}, 0) > 0`
      : `nullif(btrim(${a}.${nome(col)}::text), '') is not null`);
    return `(${parti.join(" or ")})`;
  }
  const filtro = c.conColonna ? ` and x.${nome(c.conColonna)} is not null` : "";
  const parti = c.tabelle.map((t) => `exists (select 1 from public.${nome(t)} x where x.order_id = ${a}.id${filtro})`);
  return `(${parti.join(" or ")})`;
}

/** Espressione numerica 0–100: il punteggio della commessa `alias`. */
export function sqlPunteggio(alias = "o"): string {
  const conPeso = REGISTRO.filter((v) => v.peso > 0);
  const totale = conPeso.reduce((s, v) => s + v.peso, 0);
  const termini = conPeso.map((v) => `(case when ${sqlCompilata(v, alias)} then ${v.peso} else 0 end)`);
  return `round(100.0 * (${termini.join("\n + ")}) / ${totale})`;
}

/**
 * Espressione text[]: le chiavi delle variabili col peso che mancano sulla commessa
 * `alias`, dalla più pesante (lo stesso ordine di `completezza().mancano`).
 */
export function sqlMancano(alias = "o"): string {
  const conPeso = REGISTRO.filter((v) => v.peso > 0).sort((a, b) => b.peso - a.peso);
  const voci = conPeso.map((v) => `case when not ${sqlCompilata(v, alias)} then '${v.chiave}' end`);
  return `array_remove(array[\n ${voci.join(",\n ")}\n]::text[], null)`;
}
