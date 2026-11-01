/**
 * Il calendario di cantiere delle date di Silvio (1/11/2026, fase 5, lotto 5.2). Vedi
 * docs/piano-silvio-commessa-ai.md, fase 5.
 *
 * Un giorno è lavorativo se non è domenica, né sabato (salvo che l'azienda lavori il sabato),
 * né una festa nazionale (Pasqua e Pasquetta calcolate), né il patrono, né una chiusura
 * dell'azienda: la chiusura estiva (agosto, configurabile) e le festività di Personale.
 *
 * Senza calendario dell'azienda valgono le feste nazionali: è il calendario predefinito di
 * `spostaGiorniLavorativi` (fondi.ts), così anche le date proposte prima che l'azienda abbia
 * scritto le sue chiusure saltano Natale e Ferragosto.
 *
 * Senza dipendenze, compatibile con Deno.
 */

export interface CalendarioCantiere {
  /** L'azienda lavora il sabato. */
  sabato?: boolean;
  /** Chiusure dell'azienda: AAAA-MM-GG, o MM-GG per quelle di ogni anno. */
  chiusure?: readonly string[];
  /** La chiusura estiva, MM-GG → MM-GG (anche a cavallo d'anno). */
  chiusuraEstiva?: { dal: string; al: string } | null;
  /** Il patrono, MM-GG, col nome del santo o della città. */
  patrono?: { giorno: string; nome?: string | null } | null;
}

export const CALENDARIO_NAZIONALE: CalendarioCantiere = Object.freeze({});

const DATA = /^(\d{4})-(\d{2})-(\d{2})$/;
const MESE_GIORNO = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** La domenica di Pasqua (calcolo gregoriano anonimo, Meeus/Jones/Butcher). */
export function pasqua(anno: number): string {
  const a = anno % 19;
  const b = Math.floor(anno / 100);
  const c = anno % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mese = Math.floor((h + l - 7 * m + 114) / 31);
  const giorno = ((h + l - 7 * m + 114) % 31) + 1;
  return `${anno}-${String(mese).padStart(2, "0")}-${String(giorno).padStart(2, "0")}`;
}

const FESTE_FISSE: Readonly<Record<string, string>> = {
  "01-01": "Capodanno",
  "01-06": "Epifania",
  "04-25": "Festa della Liberazione",
  "05-01": "Festa del lavoro",
  "06-02": "Festa della Repubblica",
  "08-15": "Ferragosto",
  "11-01": "Ognissanti",
  "12-08": "Immacolata",
  "12-25": "Natale",
  "12-26": "Santo Stefano",
};

function piuUnGiorno(data: string): string {
  const m = DATA.exec(data)!;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1)).toISOString().slice(0, 10);
}

/** Il nome della festa nazionale di quel giorno, o null. */
export function festaNazionale(data: string): string | null {
  const m = DATA.exec(data);
  if (!m) return null;
  const fissa = FESTE_FISSE[`${m[2]}-${m[3]}`];
  if (fissa) return fissa;
  const p = pasqua(Number(m[1]));
  if (data === p) return "Pasqua";
  if (data === piuUnGiorno(p)) return "Lunedì dell'Angelo";
  return null;
}

/** MM-GG dentro [dal, al], anche a cavallo d'anno (12-24 → 01-06). */
function dentro(meseGiorno: string, dal: string, al: string): boolean {
  return dal <= al ? meseGiorno >= dal && meseGiorno <= al : meseGiorno >= dal || meseGiorno <= al;
}

/** Perché quel giorno in cantiere non si lavora, o null se si lavora. */
export function motivoChiuso(data: string, cal: CalendarioCantiere = CALENDARIO_NAZIONALE): string | null {
  const m = DATA.exec(data);
  if (!m) return null;
  const dow = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
  if (dow === 0) return "domenica";
  if (dow === 6 && !cal.sabato) return "sabato";
  const festa = festaNazionale(data);
  if (festa) return festa;
  const mg = `${m[2]}-${m[3]}`;
  if (cal.patrono && cal.patrono.giorno === mg) return cal.patrono.nome ? `patrono (${cal.patrono.nome})` : "patrono";
  const est = cal.chiusuraEstiva;
  if (est && MESE_GIORNO.test(est.dal) && MESE_GIORNO.test(est.al) && dentro(mg, est.dal, est.al)) return "chiusura estiva dell'azienda";
  if (cal.chiusure?.some((c) => c === data || c === mg)) return "chiusura dell'azienda";
  return null;
}

export function lavorativo(data: string, cal: CalendarioCantiere = CALENDARIO_NAZIONALE): boolean {
  return motivoChiuso(data, cal) === null;
}

/**
 * `data` più `n` giorni lavorativi (anche negativi). Con n = 0 resta il giorno dato, anche
 * se è festa: per il primo giorno utile c'è `primoGiornoUtile`.
 */
export function spostaLavorativi(data: string, n: number, cal: CalendarioCantiere = CALENDARIO_NAZIONALE): string {
  const m = DATA.exec(data);
  if (!m || n === 0 || !Number.isFinite(n)) return data;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const passo = n > 0 ? 1 : -1;
  // Al massimo due anni di giorni: un calendario tutto chiuso non gira all'infinito.
  for (let fatti = 0, giri = 0; fatti < Math.abs(n) && giri < 800; giri++) {
    d.setUTCDate(d.getUTCDate() + passo);
    if (lavorativo(d.toISOString().slice(0, 10), cal)) fatti++;
  }
  return d.toISOString().slice(0, 10);
}

/** Il primo giorno lavorativo da `data` in poi. */
export function primoGiornoUtile(data: string, cal: CalendarioCantiere = CALENDARIO_NAZIONALE): string {
  if (!DATA.test(data) || lavorativo(data, cal)) return data;
  return spostaLavorativi(data, 1, cal);
}

/** Giorni lavorativi da `da` (escluso) ad `a` (incluso); negativo se `a` è prima. */
export function lavorativiTra(da: string, a: string, cal: CalendarioCantiere = CALENDARIO_NAZIONALE): number {
  if (!DATA.test(da) || !DATA.test(a) || da === a) return 0;
  if (a < da) return -lavorativiTra(a, da, cal);
  let n = 0;
  for (let d = piuUnGiorno(da), giri = 0; d <= a && giri < 800; d = piuUnGiorno(d), giri++) {
    if (lavorativo(d, cal)) n++;
  }
  return n;
}

/** Le chiusure che cadono dentro [dal, al], per dire perché una fase è più lunga. */
export function chiusureNelPeriodo(dal: string, al: string, cal: CalendarioCantiere = CALENDARIO_NAZIONALE): { data: string; motivo: string }[] {
  if (!DATA.test(dal) || !DATA.test(al) || al < dal) return [];
  const out: { data: string; motivo: string }[] = [];
  for (let d = dal, giri = 0; d <= al && giri < 800; d = piuUnGiorno(d), giri++) {
    const motivo = motivoChiuso(d, cal);
    if (motivo && motivo !== "sabato" && motivo !== "domenica") out.push({ data: d, motivo });
  }
  return out;
}

// ── Il patrono della città del cantiere ─────────────────────────────────────

/** I patroni dei capoluoghi più grandi (festa cittadina in cui i cantieri si fermano). */
export const PATRONI: Readonly<Record<string, { giorno: string; nome: string }>> = {
  ancona: { giorno: "05-04", nome: "San Ciriaco" },
  bari: { giorno: "12-06", nome: "San Nicola" },
  bergamo: { giorno: "08-26", nome: "Sant'Alessandro" },
  bologna: { giorno: "10-04", nome: "San Petronio" },
  brescia: { giorno: "02-15", nome: "Santi Faustino e Giovita" },
  cagliari: { giorno: "10-30", nome: "San Saturnino" },
  catania: { giorno: "02-05", nome: "Sant'Agata" },
  como: { giorno: "08-31", nome: "Sant'Abbondio" },
  cremona: { giorno: "11-13", nome: "Sant'Omobono" },
  ferrara: { giorno: "04-23", nome: "San Giorgio" },
  firenze: { giorno: "06-24", nome: "San Giovanni Battista" },
  genova: { giorno: "06-24", nome: "San Giovanni Battista" },
  lecce: { giorno: "08-26", nome: "Sant'Oronzo" },
  milano: { giorno: "12-07", nome: "Sant'Ambrogio" },
  modena: { giorno: "01-31", nome: "San Geminiano" },
  monza: { giorno: "06-24", nome: "San Giovanni Battista" },
  napoli: { giorno: "09-19", nome: "San Gennaro" },
  novara: { giorno: "01-22", nome: "San Gaudenzio" },
  padova: { giorno: "06-13", nome: "Sant'Antonio" },
  palermo: { giorno: "07-15", nome: "Santa Rosalia" },
  parma: { giorno: "01-13", nome: "Sant'Ilario" },
  pavia: { giorno: "12-09", nome: "San Siro" },
  perugia: { giorno: "01-29", nome: "San Costanzo" },
  piacenza: { giorno: "07-04", nome: "Sant'Antonino" },
  pisa: { giorno: "06-17", nome: "San Ranieri" },
  "reggio emilia": { giorno: "11-24", nome: "San Prospero" },
  rimini: { giorno: "10-14", nome: "San Gaudenzo" },
  roma: { giorno: "06-29", nome: "Santi Pietro e Paolo" },
  salerno: { giorno: "09-21", nome: "San Matteo" },
  torino: { giorno: "06-24", nome: "San Giovanni Battista" },
  trento: { giorno: "06-26", nome: "San Vigilio" },
  treviso: { giorno: "04-27", nome: "San Liberale" },
  trieste: { giorno: "11-03", nome: "San Giusto" },
  venezia: { giorno: "04-25", nome: "San Marco" },
  verona: { giorno: "05-21", nome: "San Zeno" },
  vicenza: { giorno: "09-08", nome: "Madonna di Monte Berico" },
};

const normale = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z' ]+/g, " ").replace(/\s+/g, " ").trim();

/**
 * La città di un indirizzo: quella dopo il CAP («20900 Monza (MB)»), altrimenti l'ultimo pezzo
 * dopo una virgola. Mai una parola qualsiasi: «Via Roma 3» non è a Roma.
 */
export function cittaDaIndirizzo(indirizzo: string | null | undefined): string | null {
  if (!indirizzo || typeof indirizzo !== "string") return null;
  const dopoCap = /\b\d{5}\s+([^,(\d]+)/.exec(indirizzo);
  const pezzo = dopoCap?.[1] ?? (indirizzo.includes(",") ? indirizzo.split(",").at(-1)!.replace(/\([A-Za-z]{2}\)/, "") : null);
  const citta = pezzo ? normale(pezzo) : "";
  return citta || null;
}

/** Il patrono della città del cantiere, se è tra quelli noti. */
export function patronoDaIndirizzo(indirizzo: string | null | undefined): { giorno: string; nome: string; citta: string } | null {
  const citta = cittaDaIndirizzo(indirizzo);
  if (!citta) return null;
  const p = PATRONI[citta];
  return p ? { ...p, citta } : null;
}

// ── Dal database al calendario ──────────────────────────────────────────────

/** Quello che restituisce `silvio_autonomia_leggi` per il calendario. */
export interface ImpostazioniCalendario {
  calendario?: {
    chiusura_dal?: string | null; chiusura_al?: string | null; patrono?: string | null;
    patrono_nome?: string | null; sabato_lavorativo?: boolean | null;
  } | null;
  festivita?: readonly { data: string; descrizione?: string | null; ricorrente?: boolean | null }[] | null;
}

/**
 * Il calendario dell'azienda per un cantiere. Il patrono scritto nelle impostazioni vale per
 * tutti i cantieri; se non c'è, si prende quello della città del cantiere.
 */
export function calendarioAzienda(imp: ImpostazioniCalendario | null | undefined, indirizzoCantiere?: string | null): CalendarioCantiere {
  const k = imp?.calendario ?? null;
  const chiusure = (imp?.festivita ?? [])
    .filter((f) => typeof f?.data === "string" && DATA.test(f.data.slice(0, 10)))
    .map((f) => (f.ricorrente ? f.data.slice(5, 10) : f.data.slice(0, 10)));
  const estiva = k?.chiusura_dal && k?.chiusura_al && MESE_GIORNO.test(k.chiusura_dal) && MESE_GIORNO.test(k.chiusura_al)
    ? { dal: k.chiusura_dal, al: k.chiusura_al } : null;
  const dalCantiere = patronoDaIndirizzo(indirizzoCantiere);
  const patrono = k?.patrono && MESE_GIORNO.test(k.patrono)
    ? { giorno: k.patrono, nome: k.patrono_nome ?? null }
    : dalCantiere ? { giorno: dalCantiere.giorno, nome: `${dalCantiere.nome}, ${dalCantiere.citta.replace(/\b\w/g, (c) => c.toUpperCase())}` } : null;
  return { sabato: k?.sabato_lavorativo === true, chiusure, chiusuraEstiva: estiva, patrono };
}
