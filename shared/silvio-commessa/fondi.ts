/**
 * Fusione dei frammenti e modifiche della bozza (31/10/2026, fase 0, lotto 0.1).
 * Vedi docs/piano-silvio-commessa-ai.md, sezioni 3.3 e 5.1.
 *
 * - `fondi(piano, frammento)`: unisce quello che un lettore ha trovato. Rispetta
 *   l'ordine di fiducia di TIPI_FONTE; un valore scritto da una persona non si tocca;
 *   se due fonti diverse dicono valori diversi nasce un Conflitto e decide l'utente.
 * - `applica(piano, modifica, storia)`: le modifiche a mano e quelle della chat, con
 *   il passo per l'annulla. `annulla(piano, storia)` torna indietro di un passo.
 *
 * Funzioni pure: non toccano il piano che ricevono, ne restituiscono uno nuovo.
 * Senza dipendenze, compatibile con Deno.
 */
import {
  AREE, TIPI_FONTE,
  type Area, type Conflitto, type Fonte, type Frammento, type Modifica, type PianoCommessa, type Valore,
} from "./piano.ts";
import { variabile } from "./registro.ts";

/** Un piano vuoto, da cui parte la bozza. */
export function pianoVuoto(companyId: string, orderId: string | null = null): PianoCommessa {
  return { orderId, companyId, aree: {}, conflitti: [], fonti: [], avvisi: [] };
}

/** Posizione nell'ordine di fiducia: 0 è la più fidata (la persona). */
export function rangoFonte(fonte: Fonte): number {
  const i = TIPI_FONTE.indexOf(fonte.tipo);
  return i < 0 ? TIPI_FONTE.length : i;
}

/** Stessa fonte = stesso documento: stesso tipo e stesso id (o, senza id, stessa etichetta). */
export function stessaFonte(a: Fonte, b: Fonte): boolean {
  if (a.tipo !== b.tipo) return false;
  if (a.id || b.id) return (a.id ?? null) === (b.id ?? null);
  return a.etichetta === b.etichetta;
}

/**
 * Due valori dicono la stessa cosa? Confronto profondo; gli importi si confrontano
 * al centesimo, i testi senza spazi ai bordi.
 */
export function stessoValore(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 0.005;
  if (typeof a === "string" && typeof b === "string") return a.trim() === b.trim();
  if (a === b) return true;
  if (a == null || b == null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => stessoValore(x, b[i]));
  }
  const ka = Object.keys(a as object).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b as object).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  return ka.length === kb.length
    && ka.every((k) => stessoValore((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

const NOTA_CONFLITTO = "Le fonti non sono d'accordo: scegli tu quale tenere.";

function conValore(piano: PianoCommessa, area: Area, chiave: string, valore: Valore | null): PianoCommessa {
  const dellArea = { ...(piano.aree[area] ?? {}) };
  if (valore) dellArea[chiave] = valore;
  else delete dellArea[chiave];
  return { ...piano, aree: { ...piano.aree, [area]: dellArea } };
}

function senzaConflitto(conflitti: Conflitto[], area: Area, chiave: string): Conflitto[] {
  return conflitti.filter((c) => !(c.area === area && c.chiave === chiave));
}

/**
 * Candidati di una variabile dopo l'arrivo di `nuovo`: una rilettura della stessa
 * fonte sostituisce la lettura vecchia; a parità di valore resta la fonte più fidata;
 * l'ordine finale è quello di fiducia (a parità, chi c'era prima).
 */
function candidati(prima: Valore[], nuovo: Valore): Valore[] {
  const tutti = [...prima.filter((c) => !stessaFonte(c.fonte, nuovo.fonte)), nuovo];
  const unici: Valore[] = [];
  for (const c of tutti) {
    const i = unici.findIndex((u) => stessoValore(u.valore, c.valore));
    if (i < 0) unici.push(c);
    else if (rangoFonte(c.fonte) < rangoFonte(unici[i].fonte)) unici[i] = c;
  }
  return unici
    .map((c, i) => ({ c, i }))
    .sort((x, y) => rangoFonte(x.c.fonte) - rangoFonte(y.c.fonte) || x.i - y.i)
    .map((x) => x.c);
}

function fondiValore(piano: PianoCommessa, area: Area, chiave: string, nuovo: Valore): PianoCommessa {
  const esistente = piano.aree[area]?.[chiave];
  const aperto = piano.conflitti.find((c) => c.area === area && c.chiave === chiave);

  // Quello che scrive una persona vince sempre, e non si rimette in discussione.
  if (nuovo.fonte.tipo === "persona") {
    return { ...conValore(piano, area, chiave, nuovo), conflitti: senzaConflitto(piano.conflitti, area, chiave) };
  }
  if (esistente?.fonte.tipo === "persona") return piano;

  const lista = candidati(aperto ? aperto.candidati : esistente ? [esistente] : [], nuovo);
  const altri = senzaConflitto(piano.conflitti, area, chiave);
  if (lista.length === 1) return { ...conValore(piano, area, chiave, lista[0]), conflitti: altri };

  // Fonti in disaccordo: non si sceglie. Nel piano resta la più fidata, segnata ⚠,
  // finché l'utente non decide con `scegli_fonte` o `cambia_valore`.
  const mostrato: Valore = { ...lista[0], stato: "attenzione", nota: NOTA_CONFLITTO };
  return {
    ...conValore(piano, area, chiave, mostrato),
    conflitti: [...altri, { area, chiave, candidati: lista }],
  };
}

/** Unisce un frammento al piano. Le chiavi che il registro non conosce diventano avvisi. */
export function fondi(piano: PianoCommessa, frammento: Frammento): PianoCommessa {
  const etichetta = frammento.fonte.etichetta;
  const avvisi = [...(piano.avvisi ?? []), ...(frammento.avvisi ?? []).map((a) => `${etichetta}: ${a}`)];
  let out: PianoCommessa = { ...piano };

  for (const [nomeArea, valori] of Object.entries(frammento.aree)) {
    if (!(AREE as readonly string[]).includes(nomeArea)) {
      avvisi.push(`${etichetta}: l'area «${nomeArea}» non esiste, ignorata`);
      continue;
    }
    const area = nomeArea as Area;
    for (const [chiave, v] of Object.entries(valori ?? {})) {
      if (variabile(chiave)?.area !== area) {
        avvisi.push(`${etichetta}: «${chiave}» non è una variabile dell'area ${area}, ignorata`);
        continue;
      }
      out = fondiValore(out, area, chiave, { ...v, fonte: v.fonte ?? frammento.fonte });
    }
  }

  const fonti = out.fonti.some((f) => stessaFonte(f, frammento.fonte)) ? out.fonti : [...out.fonti, frammento.fonte];
  return { ...out, fonti, avvisi };
}

// ── Modifiche e annulla ─────────────────────────────────────────────────────

/** Un passo della storia: com'erano le variabili toccate prima della modifica. */
export interface Passo {
  modifica: Modifica;
  prima: { area: Area; chiave: string; valore: Valore | null }[];
  /** I conflitti aperti, prima della modifica, sulle sole variabili toccate. */
  conflittiPrima: Conflitto[];
}

export interface Bozza {
  piano: PianoCommessa;
  storia: Passo[];
}

function controllaChiave(area: Area, chiave: string): void {
  if (variabile(chiave)?.area !== area) throw new Error(`«${chiave}» non è una variabile dell'area ${area}`);
}

function daPersona(valore: unknown, etichetta: string, base?: Fonte): Valore {
  const fonte: Fonte = base
    ? { ...base, tipo: "persona", etichetta: `${etichetta}: ${base.etichetta}` }
    : { tipo: "persona", etichetta };
  return { valore, fonte, fiducia: 1, stato: "fatto", nota: null };
}

/** Il campo delle fasi che contiene la lista; ogni fase è un oggetto con `id?`, `name`, `start_date?`, `end_date?` (AAAA-MM-GG). */
const CHIAVE_FASI = "fasi.order_work_phases";
/** Le date singole che seguono la fine dei lavori. */
const DATE_FINALI = ["fasi.work_end_date", "fasi.expected_date"] as const;

/** Sposta una data AAAA-MM-GG di `n` giorni lavorativi (lun–ven; i festivi arrivano nella fase 5). */
export function spostaGiorniLavorativi(data: string, n: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  if (!m || n === 0) return data;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const passo = n > 0 ? 1 : -1;
  for (let fatti = 0; fatti < Math.abs(n);) {
    d.setUTCDate(d.getUTCDate() + passo);
    const g = d.getUTCDay();
    if (g !== 0 && g !== 6) fatti++;
  }
  return d.toISOString().slice(0, 10);
}

function spostaFase(fase: unknown, n: number): unknown {
  if (!fase || typeof fase !== "object") return fase;
  const f = { ...(fase as Record<string, unknown>) };
  for (const k of ["start_date", "end_date"]) {
    if (typeof f[k] === "string") f[k] = spostaGiorniLavorativi(f[k] as string, n);
  }
  return f;
}

/** Le variabili toccate da una modifica, coi loro valori nuovi (null = tolta). */
function effetti(piano: PianoCommessa, modifica: Modifica): { area: Area; chiave: string; valore: Valore | null }[] {
  switch (modifica.tipo) {
    case "cambia_valore":
      controllaChiave(modifica.area, modifica.chiave);
      return [{ area: modifica.area, chiave: modifica.chiave, valore: daPersona(modifica.valore, "modificato da te") }];

    case "togli": {
      controllaChiave(modifica.area, modifica.chiave);
      const attuale = piano.aree[modifica.area]?.[modifica.chiave]?.valore;
      if (modifica.indice == null) {
        // Resta come «tolto da te» (null scritto da una persona): un frammento che arriva
        // dopo non lo rimette.
        return [{ area: modifica.area, chiave: modifica.chiave, valore: daPersona(null, "tolto da te") }];
      }
      if (!Array.isArray(attuale) || modifica.indice < 0 || modifica.indice >= attuale.length) {
        throw new Error(`«${modifica.chiave}» non ha un elemento ${modifica.indice}`);
      }
      const lista = attuale.filter((_, i) => i !== modifica.indice);
      return [{ area: modifica.area, chiave: modifica.chiave, valore: daPersona(lista, "modificato da te") }];
    }

    case "aggiungi": {
      controllaChiave(modifica.area, modifica.chiave);
      const attuale = piano.aree[modifica.area]?.[modifica.chiave]?.valore;
      if (attuale != null && !Array.isArray(attuale)) throw new Error(`«${modifica.chiave}» non è un elenco`);
      const lista = [...((attuale as unknown[] | null | undefined) ?? []), modifica.valore];
      return [{ area: modifica.area, chiave: modifica.chiave, valore: daPersona(lista, "modificato da te") }];
    }

    case "sposta_date": {
      const n = modifica.giorniLavorativi;
      if (!Number.isInteger(n)) throw new Error("Lo spostamento va in giorni lavorativi interi");
      if (n === 0) return [];
      const fasi = piano.aree.fasi ?? {};
      const out: { area: Area; chiave: string; valore: Valore | null }[] = [];
      const sposta = (chiave: string, valore: unknown) => {
        out.push({ area: "fasi", chiave, valore: daPersona(valore, "spostato da te", fasi[chiave]?.fonte) });
      };

      const elenco = fasi[CHIAVE_FASI]?.valore;
      let da = 0;
      if (modifica.daFase) {
        const i = Array.isArray(elenco)
          ? elenco.findIndex((f) => {
            const r = (f ?? {}) as Record<string, unknown>;
            return r.id === modifica.daFase || r.name === modifica.daFase;
          })
          : -1;
        if (i < 0) throw new Error(`La fase «${modifica.daFase}» non c'è`);
        da = i;
      }
      if (Array.isArray(elenco)) sposta(CHIAVE_FASI, elenco.map((f, i) => (i >= da ? spostaFase(f, n) : f)));

      const date = modifica.daFase ? [...DATE_FINALI] : ["fasi.work_start_date", ...DATE_FINALI];
      for (const chiave of date) {
        const v = fasi[chiave]?.valore;
        if (typeof v === "string") sposta(chiave, spostaGiorniLavorativi(v, n));
      }
      return out;
    }

    case "scegli_fonte": {
      const conflitto = piano.conflitti.find((c) => c.area === modifica.area && c.chiave === modifica.chiave);
      if (!conflitto) throw new Error(`Su «${modifica.chiave}» non c'è niente da scegliere`);
      const scelto = conflitto.candidati.find((c) =>
        c.fonte.tipo === modifica.fonte && (modifica.idFonte == null || c.fonte.id === modifica.idFonte));
      if (!scelto) throw new Error(`«${modifica.chiave}»: nessun valore dalla fonte ${modifica.fonte}`);
      // Scelto dall'utente: vale come scritto da una persona, ma la ⓘ porta ancora al documento.
      return [{ area: modifica.area, chiave: modifica.chiave, valore: daPersona(scelto.valore, "scelto da te", scelto.fonte) }];
    }
  }
}

/** Applica una modifica e aggiunge alla storia il passo per annullarla. */
export function applica(piano: PianoCommessa, modifica: Modifica, storia: Passo[] = []): Bozza {
  const cambi = effetti(piano, modifica);
  if (cambi.length === 0) return { piano, storia };

  const passo: Passo = {
    modifica,
    prima: cambi.map(({ area, chiave }) => ({ area, chiave, valore: piano.aree[area]?.[chiave] ?? null })),
    conflittiPrima: piano.conflitti.filter((c) => cambi.some((x) => x.area === c.area && x.chiave === c.chiave)),
  };
  let out = piano;
  for (const { area, chiave, valore } of cambi) {
    out = { ...conValore(out, area, chiave, valore), conflitti: senzaConflitto(out.conflitti, area, chiave) };
  }
  return { piano: out, storia: [...storia, passo] };
}

/**
 * Annulla l'ultimo passo della storia: le variabili toccate tornano com'erano, coi loro
 * conflitti. Il resto del piano (frammenti arrivati nel frattempo) resta. Con la storia
 * vuota non fa niente.
 */
export function annulla(piano: PianoCommessa, storia: Passo[]): Bozza {
  const passo = storia[storia.length - 1];
  if (!passo) return { piano, storia };
  let out = piano;
  let conflitti = piano.conflitti;
  for (const { area, chiave, valore } of passo.prima) {
    out = conValore(out, area, chiave, valore);
    conflitti = senzaConflitto(conflitti, area, chiave);
  }
  return { piano: { ...out, conflitti: [...conflitti, ...passo.conflittiPrima] }, storia: storia.slice(0, -1) };
}
