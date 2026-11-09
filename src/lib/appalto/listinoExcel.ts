/**
 * Il listino del committente da un foglio: si legge, si controlla riga per riga
 * e solo dopo si scrive. Un prezzo letto male finirebbe in fattura, quindi una
 * riga dubbia si scarta e si fa vedere, non si indovina.
 */
import { parseListinoNumber } from "@/lib/catalogo/listinoParser";

export interface RigaListino {
  /** La riga del foglio, per ritrovarla. */
  riga: number;
  descrizione: string;
  tipo: string;
  unita_misura: string;
  prezzo_unitario: number;
  codice: string | null;
  qualifica: string | null;
  note: string | null;
  problema: string | null;
  /** Nel foglio il tipo non c'era: nell'anteprima si fa scegliere. */
  tipoDaScegliere?: boolean;
}

export interface VoceEsistente { codice: string | null; descrizione: string; unita_misura: string; attivo: boolean }

const pulito = (v: unknown) => String(v ?? "").trim();
const chiave = (v: unknown) => pulito(v).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[.:]/g, "").replace(/\s+/g, " ");

const COLONNE: Record<string, string[]> = {
  descrizione: ["descrizione", "voce", "lavorazione", "articolo", "descrizione voce"],
  prezzo: ["prezzo", "prezzo unitario", "importo", "tariffa", "€", "euro", "prezzo €", "prezzo (€)"],
  unita: ["unita", "um", "u m", "unita di misura", "misura"],
  tipo: ["tipo", "categoria"],
  codice: ["codice", "cod", "art", "codice voce"],
  qualifica: ["qualifica", "livello"],
  note: ["note", "nota"],
};

const UNITA: Record<string, string> = {
  ora: "ora", ore: "ora", h: "ora", hr: "ora",
  giornata: "giornata", giornate: "giornata", giorno: "giornata", gg: "giornata",
  "uomo/giorno": "uomo_giorno", "uomo giorno": "uomo_giorno", uomo_giorno: "uomo_giorno", ug: "uomo_giorno", "u/g": "uomo_giorno",
  viaggio: "viaggio", viaggi: "viaggio",
  km: "km", chilometri: "km",
  mq: "mq", m2: "mq", "m²": "mq", "metro quadro": "mq",
  ml: "ml", m: "ml", metro: "ml", "metro lineare": "ml",
  mc: "mc", m3: "mc", "m³": "mc", "metro cubo": "mc",
  kg: "kg", chilo: "kg", chili: "kg",
  cad: "cad", pz: "cad", n: "cad", nr: "cad", pezzo: "cad", pezzi: "cad", cadauno: "cad",
  corpo: "corpo", "a corpo": "corpo", forfait: "corpo",
};

const TIPI: Record<string, string> = {
  manodopera: "manodopera", trasporto: "trasporto", lavorazione: "lavorazione", posa: "lavorazione",
  nolo: "nolo", noleggio: "nolo", materiale: "materiale", materiali: "materiale", forfait: "forfait",
};

export const TIPI_VOCE: Array<{ v: string; label: string }> = [
  { v: "manodopera", label: "Manodopera" }, { v: "trasporto", label: "Trasporto" }, { v: "lavorazione", label: "Lavorazione" },
  { v: "nolo", label: "Nolo" }, { v: "materiale", label: "Materiale" }, { v: "forfait", label: "Forfait" },
];

/**
 * Il tipo non è un'etichetta: i rapportini cercano le voci di manodopera per
 * valorizzare le ore. Senza un tipo scritto non si indovina «manodopera» dall'unità,
 * altrimenti un nolo a ore finirebbe sulle ore degli operai: si propone
 * «Lavorazione» e nell'anteprima si sceglie.
 */
const TIPO_SENZA_INDICAZIONE = "lavorazione";

/** Solo cifre e separatori: «-», «1e5», «0x10» e «12 34» per il parser generale sarebbero numeri. */
function prezzoDaTesto(testo: string): number {
  const nudo = testo.replace(/€|EUR/gi, "").trim();
  return /^-?\d+(?:[.,]\d+)*$/.test(nudo) ? parseListinoNumber(nudo) : Number.NaN;
}

const PREZZO_MASSIMO = 9_999_999_999;

export function interpretaListino(tabella: unknown[][]): { righe: RigaListino[]; senzaIntestazione: boolean; colonneDoppie?: string } {
  const posizione = (intestazione: unknown[], nomi: string[]) => intestazione.findIndex((c) => nomi.includes(chiave(c)));
  const indice = tabella.findIndex((r) => posizione(r, COLONNE.descrizione) >= 0 && posizione(r, COLONNE.prezzo) >= 0);
  if (indice < 0) return { righe: [], senzaIntestazione: true };
  const testa = tabella[indice];
  // Due colonne che possono essere lo stesso dato («Importo» e «Prezzo»): scegliere vorrebbe dire indovinare.
  for (const nomi of Object.values(COLONNE)) {
    const trovate = testa.filter((c) => nomi.includes(chiave(c)));
    if (trovate.length > 1) return { righe: [], senzaIntestazione: false, colonneDoppie: trovate.map(pulito).join(", ") };
  }
  const col = Object.fromEntries(Object.entries(COLONNE).map(([k, nomi]) => [k, posizione(testa, nomi)])) as Record<keyof typeof COLONNE, number>;
  const leggi = (r: unknown[], k: keyof typeof COLONNE) => (col[k] >= 0 ? r[col[k]] : "");

  const codiciVisti = new Set<string>();
  const vociViste = new Set<string>();
  const righe: RigaListino[] = [];
  tabella.slice(indice + 1).forEach((r, i) => {
    if (r.every((c) => pulito(c) === "")) return;
    const descrizione = pulito(leggi(r, "descrizione"));
    const grezzo = leggi(r, "prezzo");
    const prezzo = typeof grezzo === "number" ? grezzo : pulito(grezzo) === "" ? Number.NaN : prezzoDaTesto(pulito(grezzo));
    const unitaScritta = pulito(leggi(r, "unita"));
    const unita = UNITA[chiave(unitaScritta)] ?? "";
    const tipoScritto = pulito(leggi(r, "tipo"));
    const tipo = TIPI[chiave(tipoScritto)];
    const codice = pulito(leggi(r, "codice")) || null;
    const voce = `${chiave(descrizione)}|${unita}`;
    let problema: string | null = null;
    if (r.slice(testa.length).some((c) => pulito(c) !== "")) problema = "Più colonne dell'intestazione: controlla le virgole";
    else if (!descrizione) problema = "Manca la descrizione";
    else if (!Number.isFinite(prezzo)) problema = pulito(grezzo) ? `Prezzo non leggibile: «${pulito(grezzo)}»` : "Manca il prezzo";
    else if (prezzo < 0) problema = "Il prezzo non può essere negativo";
    else if (prezzo > PREZZO_MASSIMO) problema = "Prezzo troppo alto";
    else if (!unita) problema = unitaScritta ? `Unità non riconosciuta: «${unitaScritta}»` : "Manca l'unità di misura";
    else if (tipoScritto && !tipo) problema = `Tipo non riconosciuto: «${tipoScritto}»`;
    else if (codice && codiciVisti.has(codice)) problema = `Codice ripetuto: ${codice}`;
    else if (vociViste.has(voce)) problema = "Voce ripetuta nel foglio";
    if (codice) codiciVisti.add(codice);
    if (!problema) vociViste.add(voce);
    righe.push({
      riga: indice + i + 2,
      descrizione,
      tipo: tipo ?? TIPO_SENZA_INDICAZIONE,
      unita_misura: unita,
      prezzo_unitario: Number.isFinite(prezzo) ? Math.abs(prezzo) === 0 ? 0 : prezzo : 0,
      codice,
      qualifica: pulito(leggi(r, "qualifica")) || null,
      note: pulito(leggi(r, "note")) || null,
      problema,
      tipoDaScegliere: !tipo && !problema,
    });
  });
  return { righe, senzaIntestazione: false };
}

/** Aggiungendo, una voce che c'è già non si raddoppia. Sostituendo, conta solo il foglio. */
export function vociGiaPresenti(righe: RigaListino[], esistenti: VoceEsistente[], sostituisci: boolean): Set<number> {
  if (sostituisci) return new Set();
  const attive = esistenti.filter((e) => e.attivo);
  const codici = new Set(attive.map((e) => e.codice).filter(Boolean));
  const voci = new Set(attive.map((e) => `${chiave(e.descrizione)}|${e.unita_misura}`));
  return new Set(righe.filter((r) => (r.codice && codici.has(r.codice)) || voci.has(`${chiave(r.descrizione)}|${r.unita_misura}`)).map((r) => r.riga));
}

function testoCella(v: unknown): unknown {
  if (v == null) return "";
  if (typeof v === "number" || typeof v === "string") return v;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as { richText?: Array<{ text: string }>; result?: unknown; text?: unknown };
    if (o.richText) return o.richText.map((t) => t.text).join("");
    if ("result" in o) return testoCella(o.result);
    if ("text" in o) return testoCella(o.text);
    // Una formula senza valore o in errore non è un dato.
    return "";
  }
  return String(v);
}

function tabellaDaCsv(testo: string): string[][] {
  const prima = testo.split(/\r?\n/, 1)[0] ?? "";
  const sep = [";", "\t", ","].sort((a, b) => prima.split(b).length - prima.split(a).length)[0];
  // Con la virgola come separatore «22,50» si spezza in due colonne e il prezzo diventa 22.
  if (sep === ",") throw new Error("Questo CSV usa la virgola per separare le colonne: un prezzo come 22,50 si spezzerebbe. Carica l'Excel o salvalo col punto e virgola.");
  const righe: string[][] = [];
  let riga: string[] = [], campo = "", virgolette = false;
  for (let i = 0; i < testo.length; i++) {
    const c = testo[i];
    if (virgolette) {
      if (c === '"' && testo[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') virgolette = false;
      else campo += c;
    } else if (c === '"') virgolette = true;
    else if (c === sep) { riga.push(campo); campo = ""; }
    else if (c === "\n") { riga.push(campo.replace(/\r$/, "")); righe.push(riga); riga = []; campo = ""; }
    else campo += c;
  }
  if (campo || riga.length) { riga.push(campo); righe.push(riga); }
  return righe;
}

export const LIMITE_FOGLIO_MB = 5;

export const LIMITE_RIGHE = 2000;

/** Excel salva spesso i CSV in Windows-1252: letti come UTF-8, gli accenti si rovinano e «Unità» non si trova. */
function testoDelFile(buf: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}

export async function leggiFoglio(file: File): Promise<unknown[][]> {
  if (file.size > LIMITE_FOGLIO_MB * 1024 * 1024) throw new Error(`Il file supera ${LIMITE_FOGLIO_MB} MB`);
  const nome = file.name.toLowerCase();
  if (nome.endsWith(".csv") || nome.endsWith(".txt")) return tabellaDaCsv(testoDelFile(await file.arrayBuffer()).replace(/^\uFEFF/, ""));
  if (!nome.endsWith(".xlsx")) throw new Error("Carica un file Excel .xlsx o un .csv");
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await file.arrayBuffer());
  } catch {
    throw new Error("Il file è rovinato o non è un vero Excel .xlsx");
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("Il file non ha fogli");
  const tabella: unknown[][] = [];
  // Anche le righe vuote, così «Riga 12» è la riga 12 del foglio.
  ws.eachRow({ includeEmpty: true }, (row) => {
    const valori = row.values as unknown[];
    tabella.push(valori.slice(1).map(testoCella));
  });
  return tabella;
}

export async function scaricaModelloListino(): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Listino");
  ws.columns = [
    { header: "Descrizione", width: 38 }, { header: "Unità", width: 12 }, { header: "Prezzo", width: 12 },
    { header: "Tipo", width: 14 }, { header: "Codice", width: 12 }, { header: "Qualifica", width: 22 }, { header: "Note", width: 30 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.addRow(["Operaio specializzato", "ora", 32.5, "Manodopera", "", "3° livello", ""]);
  ws.addRow(["Autocarro con autista", "ora", 55, "Trasporto", "", "", ""]);
  ws.addRow(["Posa cappotto", "mq", 22, "Lavorazione", "", "", ""]);
  const blob = new Blob([await wb.xlsx.writeBuffer()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "Modello listino.xlsx";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
