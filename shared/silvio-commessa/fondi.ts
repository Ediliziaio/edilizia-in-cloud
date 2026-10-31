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
 * Fase 3 (31/10/2026): una modifica che arriva con altre (una risposta della chat, la data
 * d'inizio che data le fasi) ha un `gruppo`, e l'annulla le toglie tutte insieme. Le fasi
 * che una commessa ha già senza date ricevono le date da un'altra fonte come proposta, in
 * `fasi.date_fasi`: aggiungere una data che manca non è sovrascrivere.
 *
 * Funzioni pure: non toccano il piano che ricevono, ne restituiscono uno nuovo.
 * Senza dipendenze, compatibile con Deno.
 */
import {
  AREE, TIPI_FONTE,
  type Area, type Conflitto, type FaseDelPiano, type Fonte, type Frammento, type Modifica, type PianoCommessa, type Valore,
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

/**
 * Il valore viene dalla commessa che si completa (fonte `persona` con l'id della commessa):
 * l'ha scritto una persona, Silvio non lo tocca. Le modifiche fatte nel popup sono `persona`
 * senza id: quelle no.
 */
export function giaNellaCommessa(piano: Pick<PianoCommessa, "orderId">, v: Pick<Valore, "fonte"> | null | undefined): boolean {
  return !!piano.orderId && !!v && v.fonte.tipo === "persona" && v.fonte.id === piano.orderId;
}

/** Il campo delle fasi che contiene la lista; ogni fase è un oggetto con `id?`, `name`, `start_date?`, `end_date?` (AAAA-MM-GG). */
const CHIAVE_FASI = "fasi.order_work_phases";
/** Le date proposte per le fasi che la commessa ha già senza date (fase 3). */
const CHIAVE_DATE_FASI = "fasi.date_fasi";

const nomeFase = (f: unknown) => String((f as { name?: unknown } | null)?.name ?? "").trim().replace(/\s+/g, " ").toLowerCase();
const datata = (f: FaseDelPiano | null | undefined) => !!f?.start_date;

/**
 * Le date che `nuove` dà alle fasi di `esistenti` che non ne hanno: per nome (come
 * `commessa_pianifica_fasi`), o per posizione se nessun nome combacia e gli elenchi sono
 * lunghi uguali. Una fase senza date ma con i giorni li porta, per la data d'inizio che
 * arriverà. Null se non c'è niente da proporre.
 */
export function dateProposteAlleFasi(esistenti: unknown, nuove: unknown): FaseDelPiano[] | null {
  if (!Array.isArray(esistenti) || !Array.isArray(nuove)) return null;
  const vecchie = esistenti as FaseDelPiano[];
  const fonti = (nuove as FaseDelPiano[]).filter((f) => f && typeof f === "object");
  if (!vecchie.some((f) => !datata(f))) return null;
  const perNome = vecchie.some((v) => fonti.some((n) => nomeFase(n) === nomeFase(v)));
  const out: FaseDelPiano[] = [];
  vecchie.forEach((v, i) => {
    if (datata(v)) return;
    const n = perNome ? fonti.find((x) => nomeFase(x) === nomeFase(v)) : fonti.length === vecchie.length ? fonti[i] : undefined;
    if (!n) return;
    const proposta: FaseDelPiano = { name: v.name };
    if (v.id) proposta.id = v.id;
    if (n.start_date && n.end_date) { proposta.start_date = n.start_date; proposta.end_date = n.end_date; }
    else if (n.giorni && n.giorno_inizio) { proposta.giorno_inizio = n.giorno_inizio; proposta.giorni = n.giorni; }
    else return;
    out.push(proposta);
  });
  return out.length ? out : null;
}

function fondiValore(piano: PianoCommessa, area: Area, chiave: string, nuovo: Valore): PianoCommessa {
  const esistente = piano.aree[area]?.[chiave];
  const aperto = piano.conflitti.find((c) => c.area === area && c.chiave === chiave);

  // Quello che scrive una persona vince sempre, e non si rimette in discussione.
  if (nuovo.fonte.tipo === "persona") {
    return { ...conValore(piano, area, chiave, nuovo), conflitti: senzaConflitto(piano.conflitti, area, chiave) };
  }
  if (esistente?.fonte.tipo === "persona") {
    // Le fasi della commessa senza date: le date che dice un'altra fonte diventano una proposta.
    const date = chiave === CHIAVE_FASI && giaNellaCommessa(piano, esistente)
      ? dateProposteAlleFasi(esistente.valore, nuovo.valore) : null;
    if (!date) return piano;
    return fondiValore(piano, "fasi", CHIAVE_DATE_FASI, {
      ...nuovo, valore: date, stato: "proposta",
      nota: `Le fasi della commessa non hanno date: te le propongo dal ${nuovo.fonte.etichetta}. Le fasi restano come sono.`,
    });
  }

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
  /** Le modifiche nate insieme (una risposta della chat) hanno lo stesso gruppo: si annullano insieme. */
  gruppo?: string | null;
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
      // Quello che la commessa ha già non si sposta: si spostano le date che Silvio propone.
      const libera = (chiave: string) => !giaNellaCommessa(piano, fasi[chiave]);
      const sposta = (chiave: string, valore: unknown) => {
        out.push({ area: "fasi", chiave, valore: daPersona(valore, "spostato da te", fasi[chiave]?.fonte) });
      };
      const conData = (f: unknown) => Array.isArray(f) && f.some((x) => typeof (x as FaseDelPiano | null)?.start_date === "string");

      const elenco = libera(CHIAVE_FASI) ? fasi[CHIAVE_FASI]?.valore : fasi[CHIAVE_DATE_FASI]?.valore;
      const chiaveElenco = libera(CHIAVE_FASI) ? CHIAVE_FASI : CHIAVE_DATE_FASI;
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
      if (conData(elenco)) sposta(chiaveElenco, (elenco as unknown[]).map((f, i) => (i >= da ? spostaFase(f, n) : f)));

      const date = modifica.daFase ? [...DATE_FINALI] : ["fasi.work_start_date", ...DATE_FINALI];
      for (const chiave of date) {
        const v = fasi[chiave]?.valore;
        if (typeof v === "string" && libera(chiave)) sposta(chiave, spostaGiorniLavorativi(v, n));
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

/**
 * Applica una modifica e aggiunge alla storia il passo per annullarla. Con `gruppo`, le
 * modifiche nate insieme si annullano insieme.
 */
export function applica(piano: PianoCommessa, modifica: Modifica, storia: Passo[] = [], gruppo: string | null = null): Bozza {
  const cambi = effetti(piano, modifica);
  if (cambi.length === 0) return { piano, storia };

  const passo: Passo = {
    modifica,
    ...(gruppo ? { gruppo } : {}),
    prima: cambi.map(({ area, chiave }) => ({ area, chiave, valore: piano.aree[area]?.[chiave] ?? null })),
    conflittiPrima: piano.conflitti.filter((c) => cambi.some((x) => x.area === c.area && x.chiave === c.chiave)),
  };
  let out = piano;
  for (const { area, chiave, valore } of cambi) {
    out = { ...conValore(out, area, chiave, valore), conflitti: senzaConflitto(out.conflitti, area, chiave) };
  }
  return { piano: out, storia: [...storia, passo] };
}

function annullaPasso(piano: PianoCommessa, passo: Passo): PianoCommessa {
  let out = piano;
  let conflitti = piano.conflitti;
  for (const { area, chiave, valore } of passo.prima) {
    out = conValore(out, area, chiave, valore);
    conflitti = senzaConflitto(conflitti, area, chiave);
  }
  return { ...out, conflitti: [...conflitti, ...passo.conflittiPrima] };
}

/**
 * Annulla l'ultimo passo della storia (e, se ha un gruppo, tutti quelli del gruppo): le
 * variabili toccate tornano com'erano, coi loro conflitti. Il resto del piano (frammenti
 * arrivati nel frattempo) resta. Con la storia vuota non fa niente.
 */
export function annulla(piano: PianoCommessa, storia: Passo[]): Bozza {
  const ultimo = storia[storia.length - 1];
  if (!ultimo) return { piano, storia };
  let out = piano;
  let resto = storia;
  do {
    out = annullaPasso(out, resto[resto.length - 1]);
    resto = resto.slice(0, -1);
  } while (ultimo.gruppo && resto.length && resto[resto.length - 1].gruppo === ultimo.gruppo);
  return { piano: out, storia: resto };
}

// ── Valori chiusi ───────────────────────────────────────────────────────────

/** Le variabili che una modifica toccherebbe. */
function chiaviDellaModifica(piano: PianoCommessa, m: Modifica): string[] {
  if (m.tipo !== "sposta_date") return [m.chiave];
  return [CHIAVE_FASI, CHIAVE_DATE_FASI, "fasi.work_start_date", ...DATE_FINALI].filter((k) => piano.aree.fasi?.[k]);
}

/**
 * Il motivo per cui la modifica non si fa (tocca quello che la commessa ha già), o null.
 * Uno spostamento delle date è fermo solo se non c'è niente di libero da spostare.
 */
export function modificaBloccata(piano: PianoCommessa, m: Modifica): string | null {
  const chiavi = chiaviDellaModifica(piano, m);
  const chiuse = chiavi.filter((k) => {
    const v = variabile(k);
    return v && giaNellaCommessa(piano, piano.aree[v.area]?.[k]);
  });
  if (!chiuse.length) return null;
  if (m.tipo === "sposta_date") {
    const libere = chiavi.filter((k) => !chiuse.includes(k));
    if (libere.length) return null;
    return "Le date delle fasi sono già nella commessa: Silvio non le sposta. Si cambiano dalla pagina della commessa.";
  }
  const ferma = chiuse[0];
  return `«${variabile(ferma)?.etichetta ?? ferma}» è già nella commessa: Silvio non lo cambia. Si modifica dalla pagina della commessa.`;
}
