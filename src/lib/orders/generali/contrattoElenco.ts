// src/lib/orders/generali/contrattoElenco.ts
// L'elenco prezzi del contratto incollato da Excel (piano §3.1, punto 7): le righe copiate da
// un foglio arrivano separate da tabulazioni, con le celle a più righe tra virgolette. Qui si
// leggono, si riconoscono le colonne e si scartano le righe che non stanno in piedi, per
// l'anteprima prima di salvare (generale_elenco_importa).

export type ColonnaElenco = "codice" | "descrizione" | "unita" | "prezzo" | "quantita" | "ignora";

export const NOMI_COLONNE: Record<ColonnaElenco, string> = {
  codice: "Codice",
  descrizione: "Descrizione",
  unita: "U.M.",
  prezzo: "Prezzo",
  quantita: "Quantità",
  ignora: "—",
};

export interface RigaElencoIncollata {
  /** Numero della riga nel foglio incollato (da 1), per dire quale non va. */
  riga: number;
  codice: string | null;
  descrizione: string;
  unitaMisura: string;
  prezzo: number;
  quantita: number | null;
}

export interface ElencoIncollato {
  colonne: ColonnaElenco[];
  intestazione: boolean;
  righe: RigaElencoIncollata[];
  scartate: { riga: number; motivo: string }[];
  /** Codici che compaiono più volte: vale l'ultima riga. */
  doppioni: string[];
}

/** Un numero scritto all'italiana o all'inglese: «1.234,56», «1234,5», «1,234.56», «€ 12,50». null se non è un numero. */
export function leggiNumero(testo: string): number | null {
  let t = testo.replace(/[\s€]/g, ""); // \s comprende anche lo spazio non separabile di Excel
  if (!t) return null;
  const virgola = t.lastIndexOf(",");
  const punto = t.lastIndexOf(".");
  if (virgola >= 0 && punto >= 0) {
    // Il separatore che viene dopo è quello dei decimali.
    t = virgola > punto ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  } else if (virgola >= 0) {
    t = /^-?\d{1,3}(,\d{3})+$/.test(t) && t.split(",").length > 2 ? t.replace(/,/g, "") : t.replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) {
    // «12.500» senza virgola: punti delle migliaia, come leggiImporto nel resto dell'app.
    t = t.replace(/\./g, "");
  }
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Celle di un foglio copiato: tabulazioni (Excel) o punto e virgola (CSV), virgolette per le celle a più righe. */
export function leggiCelle(testo: string): string[][] {
  const separatore = testo.includes("\t") ? "\t" : ";";
  const righe: string[][] = [];
  let riga: string[] = [];
  let cella = "";
  let virgolette = false;
  for (let i = 0; i < testo.length; i++) {
    const c = testo[i];
    if (virgolette) {
      if (c === '"' && testo[i + 1] === '"') { cella += '"'; i++; }
      else if (c === '"') virgolette = false;
      else cella += c;
    } else if (c === '"' && cella === "") {
      virgolette = true;
    } else if (c === separatore) {
      riga.push(cella); cella = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && testo[i + 1] === "\n") i++;
      riga.push(cella); righe.push(riga); riga = []; cella = "";
    } else {
      cella += c;
    }
  }
  if (cella !== "" || riga.length > 0) { riga.push(cella); righe.push(riga); }
  return righe.map((r) => r.map((x) => x.replace(/\s+/g, " ").trim())).filter((r) => r.some((x) => x !== ""));
}

const INTESTAZIONI: [ColonnaElenco, RegExp][] = [
  ["codice", /^(cod(ice)?|art(icolo)?|voce|n\.?|num(ero)?|tariffa|rif\.?)$/i],
  ["descrizione", /^(descr(izione)?|lavorazion[ei]|denominazione|designazione)/i],
  ["unita", /^(u\.?\s?m\.?|unit[àa](\s+di\s+misura)?|misura)$/i],
  ["quantita", /^(q\.?\s?t[àa]\.?|quantit[àa]|qta)/i],
  ["prezzo", /^(prezzo|p\.?\s?u\.?|importo\s+unitario|€|euro)/i],
];

function colonnaDiIntestazione(cella: string): ColonnaElenco | null {
  for (const [col, re] of INTESTAZIONI) if (re.test(cella.trim())) return col;
  return null;
}

/** Senza intestazione le colonne si deducono dal numero: le forme più comuni di un elenco prezzi. */
function colonnePerPosizione(n: number): ColonnaElenco[] {
  if (n <= 1) return ["descrizione"];
  if (n === 2) return ["descrizione", "prezzo"];
  if (n === 3) return ["descrizione", "unita", "prezzo"];
  if (n === 4) return ["codice", "descrizione", "unita", "prezzo"];
  // Codice, descrizione, U.M., quantità, prezzo (un computo) e il resto (importo) si ignora.
  return ["codice", "descrizione", "unita", "quantita", "prezzo", ...Array<ColonnaElenco>(n - 5).fill("ignora")];
}

/**
 * Legge l'elenco incollato. `colonne` permette di correggere la scelta automatica dall'anteprima.
 * Una riga senza descrizione o senza un prezzo valido si scarta, con il motivo.
 */
export function leggiElencoIncollato(testo: string, colonne?: ColonnaElenco[]): ElencoIncollato {
  const celle = leggiCelle(testo);
  const larghezza = celle.reduce((m, r) => Math.max(m, r.length), 0);
  const primaRiga = celle[0] ?? [];
  const daIntestazione = primaRiga.map(colonnaDiIntestazione);
  // Un'intestazione ha almeno due nomi di colonna riconosciuti e nessun numero.
  const intestazione = daIntestazione.filter(Boolean).length >= 2 && primaRiga.every((c) => leggiNumero(c) === null);
  const scelte: ColonnaElenco[] = colonne && colonne.length > 0
    ? Array.from({ length: larghezza }, (_, i) => colonne[i] ?? "ignora")
    : intestazione
      ? Array.from({ length: larghezza }, (_, i) => daIntestazione[i] ?? "ignora")
      : colonnePerPosizione(larghezza);

  const indice = (col: ColonnaElenco) => scelte.indexOf(col);
  const [iCodice, iDescr, iUnita, iPrezzo, iQuantita] = (["codice", "descrizione", "unita", "prezzo", "quantita"] as const).map(indice);
  const righe: RigaElencoIncollata[] = [];
  const scartate: { riga: number; motivo: string }[] = [];
  const visti = new Map<string, number>();
  const doppioni = new Set<string>();

  celle.forEach((r, i) => {
    if (intestazione && i === 0) return;
    const n = i + 1;
    const descrizione = iDescr >= 0 ? (r[iDescr] ?? "").trim() : "";
    const testoPrezzo = iPrezzo >= 0 ? (r[iPrezzo] ?? "") : "";
    const prezzo = leggiNumero(testoPrezzo);
    if (!descrizione) { scartate.push({ riga: n, motivo: "manca la descrizione" }); return; }
    if (prezzo === null) { scartate.push({ riga: n, motivo: testoPrezzo ? `«${testoPrezzo}» non è un prezzo` : "manca il prezzo" }); return; }
    if (prezzo < 0) { scartate.push({ riga: n, motivo: "il prezzo è negativo" }); return; }
    const quantita = iQuantita >= 0 ? leggiNumero(r[iQuantita] ?? "") : null;
    const codice = iCodice >= 0 ? (r[iCodice] ?? "").trim() || null : null;
    const voce: RigaElencoIncollata = {
      riga: n,
      codice,
      descrizione,
      unitaMisura: iUnita >= 0 ? (r[iUnita] ?? "").trim() : "",
      prezzo: Math.round(prezzo * 10_000) / 10_000,
      quantita: quantita !== null && quantita >= 0 ? Math.round(quantita * 1000) / 1000 : null,
    };
    if (codice && visti.has(codice)) {
      doppioni.add(codice);
      righe[visti.get(codice)!] = voce;
      return;
    }
    if (codice) visti.set(codice, righe.length);
    righe.push(voce);
  });

  return { colonne: scelte, intestazione, righe, scartate, doppioni: [...doppioni] };
}

/** Le righe come le vuole generale_elenco_importa. */
export const righePerImport = (righe: readonly RigaElencoIncollata[]) =>
  righe.map((r) => ({
    codice: r.codice,
    descrizione: r.descrizione,
    unita_misura: r.unitaMisura,
    prezzo: r.prezzo,
    quantita_contratto: r.quantita,
  }));
