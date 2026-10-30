// src/lib/orders/generali/unitaSerie.ts
// «Nuove unità in serie»: la tabella A1…A6 da compilare o da incollare da Excel, con il
// controllo prima di salvare (piano, §3.1 punto 7). Le righe buone vanno a generale_unita_serie.
import { leggiImporto } from "@/lib/controlloGestione/formatCG";

export const COLONNE_SERIE = ["sigla", "edificio", "piano", "tipologia", "mq", "millesimi", "listino"] as const;
export type ColonnaSerie = typeof COLONNE_SERIE[number];

export const NOMI_COLONNA: Record<ColonnaSerie, string> = {
  sigla: "Sigla",
  edificio: "Edificio",
  piano: "Piano",
  tipologia: "Tipologia",
  mq: "m² comm.",
  millesimi: "Millesimi",
  listino: "Listino €",
};

/** Una riga come si scrive: tutto testo, così si vede e si corregge quello che è arrivato da Excel. */
export type RigaSerie = Record<ColonnaSerie, string>;

export const rigaVuota = (): RigaSerie => ({ sigla: "", edificio: "", piano: "", tipologia: "", mq: "", millesimi: "", listino: "" });

export const MAX_SERIE = 100;

/** A1…A6: un prefisso e due numeri. «A», 1, 6 → A1, A2, …, A6. */
export function generaSigle(prefisso: string, da: number, a: number): string[] {
  const p = prefisso.trim();
  if (!Number.isInteger(da) || !Number.isInteger(a) || da < 0 || a < da) return [];
  const n = Math.min(MAX_SERIE, a - da + 1);
  return Array.from({ length: n }, (_, i) => `${p}${da + i}`);
}

// Le intestazioni che si trovano nei fogli dei costruttori, per riconoscere le colonne.
const INTESTAZIONI: [ColonnaSerie, RegExp][] = [
  ["millesimi", /millesim|‰|^mill/],
  ["mq", /m²|m2|mq|superf|^sup/],
  ["listino", /prezz|listino|importo|valore|€|euro/],
  ["edificio", /edific|palazz|scala|lotto|corpo|blocco/],
  ["piano", /piano|livello/],
  ["tipologia", /tipolog|^tipo|destinaz/],
  ["sigla", /sigla|unit|nome|codice|interno|^n[°.]?$|^id$/],
];

const colonnaDi = (intestazione: string): ColonnaSerie | null => {
  const t = intestazione.trim().toLowerCase();
  if (!t) return null;
  return INTESTAZIONI.find(([, re]) => re.test(t))?.[0] ?? null;
};

/** Il testo incollato è più di una cella (righe o colonne da Excel)? Una cella sola si incolla normalmente. */
export const isIncollaDaFoglio = (testo: string) => /[\t\n]/.test(testo.replace(/\r?\n$/, ""));

/**
 * Righe incollate da Excel dentro la tabella, a partire dalla cella dove si incolla
 * (celle separate da tabulazione; da un CSV, da punto e virgola). Se la prima riga è
 * un'intestazione le colonne si riconoscono dal nome; altrimenti valgono nell'ordine della
 * tabella a partire dalla colonna della cella. Le righe che mancano si aggiungono.
 */
export function incollaInTabella(righe: RigaSerie[], testo: string, rigaInizio: number, colonnaInizio: ColonnaSerie): RigaSerie[] {
  const linee = testo.replace(/\r\n?/g, "\n").split("\n").filter((r) => r.trim() !== "");
  if (linee.length === 0) return righe;
  const separatore = linee.some((r) => r.includes("\t")) ? "\t" : linee.some((r) => r.includes(";")) ? ";" : "\t";
  const celle = linee.map((r) => r.split(separatore).map((c) => c.trim().replace(/^"(.*)"$/, "$1")));

  const prima = celle[0].map(colonnaDi);
  // È un'intestazione se riconosce almeno due colonne e nessuna cella sembra un numero.
  const intestazione = prima.filter(Boolean).length >= 2 && !celle[0].some((c) => c !== "" && /^-?[\d.,\s€]+$/.test(c));
  const da = COLONNE_SERIE.indexOf(colonnaInizio);
  const mappa: (ColonnaSerie | null)[] = intestazione
    ? prima.map((c, i) => (c && prima.indexOf(c) === i ? c : null))
    : celle[0].map((_, i) => COLONNE_SERIE[da + i] ?? null);

  const dati = intestazione ? celle.slice(1) : celle;
  const nuove = righe.map((r) => ({ ...r }));
  dati.slice(0, Math.max(0, MAX_SERIE - rigaInizio)).forEach((r, k) => {
    const i = rigaInizio + k;
    while (nuove.length <= i) nuove.push(rigaVuota());
    r.forEach((c, j) => {
      const col = mappa[j];
      if (col) nuove[i][col] = c;
    });
  });
  return nuove;
}

/** Righe incollate da Excel in una tabella vuota (vedi incollaInTabella). */
export function leggiIncolla(testo: string): RigaSerie[] {
  return incollaInTabella([], testo, 0, "sigla").filter((r) => COLONNE_SERIE.some((c) => r[c] !== ""));
}

/** Un numero da una cella: vuota = null; scritto male = NaN. Accetta «1.234,5», «95,5 m²», «250.000 €». */
function leggiNumero(cella: string): number | null {
  const pulita = cella.replace(/m²|m2|mq|‰/gi, "").trim();
  if (pulita === "") return null;
  const n = leggiImporto(pulita);
  return n === null ? NaN : n;
}

export interface RigaControllata {
  riga: RigaSerie;
  errori: string[];
}

export interface UnitaDaCreare {
  sigla: string;
  edificio: string | null;
  piano: string | null;
  tipologia: string | null;
  mq_commerciali: number | null;
  millesimi: number | null;
  prezzo_listino: number | null;
}

/**
 * Controlla le righe prima di salvare: sigla presente e unica (nella serie e nella generale),
 * numeri leggibili e non negativi. Le righe del tutto vuote non contano.
 */
export function controllaSerie(righe: RigaSerie[], sigleEsistenti: string[]): { righe: RigaControllata[]; unita: UnitaDaCreare[]; errori: number } {
  const piene = righe.filter((r) => COLONNE_SERIE.some((c) => r[c].trim() !== ""));
  const esistenti = new Set(sigleEsistenti.map((s) => s.trim().toLowerCase()));
  const conteggio = new Map<string, number>();
  for (const r of piene) {
    const k = r.sigla.trim().toLowerCase();
    if (k) conteggio.set(k, (conteggio.get(k) ?? 0) + 1);
  }
  const controllate = piene.map((riga): RigaControllata => {
    const errori: string[] = [];
    const sigla = riga.sigla.trim();
    if (!sigla) errori.push("Manca la sigla.");
    else if (sigla.length > 40) errori.push("Sigla troppo lunga.");
    else if (esistenti.has(sigla.toLowerCase())) errori.push(`C'è già un'unità ${sigla}.`);
    else if ((conteggio.get(sigla.toLowerCase()) ?? 0) > 1) errori.push(`${sigla} è ripetuta.`);
    for (const [col, nome] of [["mq", "m²"], ["millesimi", "millesimi"], ["listino", "listino"]] as const) {
      const n = leggiNumero(riga[col]);
      if (n !== null && Number.isNaN(n)) errori.push(`${nome}: non è un numero.`);
      else if (n !== null && n < 0) errori.push(`${nome}: negativo.`);
    }
    return { riga, errori };
  });
  if (controllate.length > MAX_SERIE) {
    controllate[MAX_SERIE].errori.push(`Al massimo ${MAX_SERIE} unità alla volta.`);
  }
  const testo = (s: string) => (s.trim() === "" ? null : s.trim());
  return {
    righe: controllate,
    unita: controllate.map(({ riga }) => ({
      sigla: riga.sigla.trim(),
      edificio: testo(riga.edificio),
      piano: testo(riga.piano),
      tipologia: testo(riga.tipologia),
      mq_commerciali: leggiNumero(riga.mq),
      millesimi: leggiNumero(riga.millesimi),
      prezzo_listino: leggiNumero(riga.listino),
    })),
    errori: controllate.filter((r) => r.errori.length > 0).length,
  };
}
