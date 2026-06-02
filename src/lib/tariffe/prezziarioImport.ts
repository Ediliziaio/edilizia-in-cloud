/**
 * #39 — Import prezziario da file (CSV / Excel) → tariffe_aziendali.
 *
 * Parser puro e testabile: prende una matrice di stringhe (righe × colonne),
 * riconosce le colonne dall'intestazione (alias IT/EN, accent/punteggiatura
 * insensitive), normalizza numeri in formato italiano (1.234,56 €) e mappa
 * tipo/unità sui valori canonici di `tariffe_aziendali`.
 *
 * I wrapper file (CSV via papaparse, Excel via exceljs dynamic import)
 * rispecchiano `src/lib/catalogo/listinoParser.ts`. Il core resta puro così è
 * verificabile in vitest senza dipendenze di runtime.
 *
 * Le voci importate finiscono nel listino `tariffe_aziendali` e vengono usate
 * automaticamente dal preventivatore e dal matching del computo metrico.
 *
 * NB: TipoTariffa / UnitaFatturazione / legacyUnitaFrom / UM_DEFAULT_BY_TIPO
 * sono un MIRROR di `src/pages/azienda/settings/SettingsTariffe/types.ts` e del
 * componente SettingsTariffe (manteniamo il lib indipendente dalla pagina .tsx
 * per non trascinare React nei test). Se cambiano gli enum, aggiornare entrambi.
 */
import Papa from "papaparse";
import { neutralizeCsvFormula } from "@/lib/csvExport";

// ── Enum canonici (mirror di SettingsTariffe/types.ts) ───────────────────────

export const TIPO_TARIFFA_VALUES = [
  "posa", "trasporto", "tiro_piano", "smaltimento", "nolo", "pratica",
  "manodopera", "sopralluogo", "progettazione", "ponteggio", "lattoneria",
  "sigillatura", "contorno", "falso_telaio", "altro",
] as const;
export type TipoTariffa = (typeof TIPO_TARIFFA_VALUES)[number];

export const UNITA_FATT_VALUES = [
  "pz", "mq", "ml", "mc", "kg", "gg", "h", "a_corpo", "km", "piano",
] as const;
export type UnitaFatturazione = (typeof UNITA_FATT_VALUES)[number];

/** Suggerimento UM per tipo (mirror UM_DEFAULT_BY_TIPO di SettingsTariffe.tsx). */
const UM_DEFAULT_BY_TIPO: Record<TipoTariffa, UnitaFatturazione> = {
  posa: "pz",
  manodopera: "h",
  trasporto: "a_corpo",
  tiro_piano: "piano",
  smaltimento: "pz",
  nolo: "gg",
  sopralluogo: "a_corpo",
  progettazione: "a_corpo",
  ponteggio: "a_corpo",
  lattoneria: "ml",
  sigillatura: "ml",
  contorno: "ml",
  falso_telaio: "pz",
  pratica: "a_corpo",
  altro: "pz",
};

/**
 * Mappa unita_fatturazione → colonna legacy `unita`
 * (CHECK DB: pz/mq/ml/mc/h/piano/km/fisso). Mirror di legacyUnitaFrom().
 */
export function legacyUnitaFrom(u: UnitaFatturazione): string {
  switch (u) {
    case "pz": case "mq": case "ml": case "mc": case "h": case "km": case "piano":
      return u;
    case "a_corpo": return "fisso";
    case "gg": return "h";
    case "kg": return "pz";
  }
}

// ── Number parsing (formati IT/EN) ───────────────────────────────────────────

/**
 * Converte un prezzo testuale in number, gestendo:
 *  - simboli valuta e testo ("€", "EUR", spazi, NBSP)
 *  - decimale a virgola IT ("85,00" → 85)
 *  - separatore migliaia ("1.234,56" → 1234.56 ; "1,234.56" → 1234.56)
 *  - raggruppamenti multipli ("1.234.567" / "1,234,567" → 1234567)
 * Ritorna null se non interpretabile.
 */
export function parseItalianNumber(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  let s = String(raw).trim();
  if (!s) return null;
  // togli valuta, lettere e spazi (NBSP incluso)
  s = s
    .replace(/\u00A0/g, "")
    .replace(/eur(o)?/gi, "")
    .replace(/[€$£\s]/g, "")
    .replace(/[a-z]/gi, "");
  if (!s || s === "-" || s === "+") return null;

  const commas = (s.match(/,/g) ?? []).length;
  const dots = (s.match(/\./g) ?? []).length;

  if (commas > 0 && dots > 0) {
    // L'ultimo separatore che compare è quello decimale.
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (commas > 0) {
    // Una sola virgola = decimale IT; più virgole = raggruppamento migliaia.
    s = commas > 1 ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (dots > 1) {
    // Più punti = raggruppamento migliaia (es. 1.234.567).
    s = s.replace(/\./g, "");
  } else if (dots === 1) {
    // Un solo punto è ambiguo: "12.000" (migliaia IT) vs "8.50" (decimale).
    // Euristica per prezzi: esattamente 3 cifre dopo il punto ⇒ migliaia.
    const frac = s.split(".")[1] ?? "";
    if (frac.length === 3) s = s.replace(".", "");
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// ── Header / colonne ─────────────────────────────────────────────────────────

export type KnownField =
  | "nome" | "prezzo_vendita" | "costo_interno" | "unita" | "tipo"
  | "descrizione" | "codice";

/** Combining diacritical marks (U+0300–U+036F) — per togliere gli accenti post-NFD. */
const COMBINING_MARKS = /[̀-ͯ]/g;

/** Normalizza un'intestazione per il matching (accent/punteggiatura insensitive). */
function normHeader(h: string): string {
  return String(h ?? "")
    .toLowerCase()
    .normalize("NFD").replace(COMBINING_MARKS, "")      // togli accenti
    .replace(/\([^)]*\)/g, " ")                        // togli "(...)"
    .replace(/[€$£%]/g, " ")
    .replace(/[._/\\\-*]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Alias intestazione → campo. Le stringhe sono già in forma normalizzata. */
const FIELD_ALIASES: Record<KnownField, string[]> = {
  nome: [
    "nome", "voce", "articolo", "denominazione", "lavorazione",
    "descrizione voce", "desc", "descrizione breve", "oggetto", "lavorazioni",
  ],
  prezzo_vendita: [
    "prezzo", "prezzo vendita", "prezzo di vendita", "prezzo unitario",
    "prezzo unit", "importo", "vendita", "prezzo listino", "listino",
    "prezzo eur", "eur", "euro", "valore", "prezzo cad",
  ],
  costo_interno: [
    "costo", "costo interno", "costo unitario", "costo acquisto",
    "acquisto", "prezzo costo", "costo eur",
  ],
  unita: [
    "um", "u m", "unita", "unita misura", "unita di misura",
    "unita fatturazione", "misura",
  ],
  tipo: ["tipo", "categoria", "tipologia", "famiglia", "gruppo"],
  descrizione: [
    "descrizione", "descrizione estesa", "note", "dettaglio",
    "descrizione lunga", "specifiche", "descrizione completa",
  ],
  codice: ["codice", "cod", "codice articolo", "cod articolo", "rif", "ref"],
};

/** Priorità in caso un header combaci con più campi (di solito non accade). */
const FIELD_PRIORITY: KnownField[] = [
  "codice", "tipo", "unita", "prezzo_vendita", "costo_interno",
  "descrizione", "nome",
];

function buildAliasLookup(): Map<string, KnownField> {
  const m = new Map<string, KnownField>();
  // inserisci in ordine inverso di priorità così la priorità alta vince
  for (let i = FIELD_PRIORITY.length - 1; i >= 0; i--) {
    const field = FIELD_PRIORITY[i];
    for (const alias of FIELD_ALIASES[field]) m.set(normHeader(alias), field);
  }
  return m;
}

// ── Tipo / unità normalization ───────────────────────────────────────────────

const TIPO_SYNONYMS: Record<string, TipoTariffa> = {
  posa: "posa", installazione: "posa", montaggio: "posa",
  manodopera: "manodopera", "mano d opera": "manodopera", operaio: "manodopera",
  trasporto: "trasporto", trasporti: "trasporto", consegna: "trasporto",
  "tiro piano": "tiro_piano", tiro: "tiro_piano", "tiro al piano": "tiro_piano",
  smaltimento: "smaltimento", "smaltimenti": "smaltimento", discarica: "smaltimento",
  nolo: "nolo", noleggio: "nolo", noli: "nolo",
  pratica: "pratica", pratiche: "pratica", burocrazia: "pratica",
  sopralluogo: "sopralluogo", rilievo: "sopralluogo",
  progettazione: "progettazione", progetto: "progettazione", direzione: "progettazione",
  ponteggio: "ponteggio", ponteggi: "ponteggio", impalcatura: "ponteggio",
  lattoneria: "lattoneria", scossalina: "lattoneria", gronda: "lattoneria",
  sigillatura: "sigillatura", silicone: "sigillatura",
  contorno: "contorno", contorni: "contorno",
  "falso telaio": "falso_telaio", controtelaio: "falso_telaio",
  altro: "altro", varie: "altro", generico: "altro",
};

/** Mappa una stringa libera al `TipoTariffa` canonico. */
export function normalizeTipo(raw: string): { tipo: TipoTariffa; matched: boolean } {
  const key = normHeader(raw);
  if (!key) return { tipo: "altro", matched: false };
  // match diretto sull'enum
  if ((TIPO_TARIFFA_VALUES as readonly string[]).includes(key.replace(/ /g, "_"))) {
    return { tipo: key.replace(/ /g, "_") as TipoTariffa, matched: true };
  }
  const syn = TIPO_SYNONYMS[key];
  if (syn) return { tipo: syn, matched: true };
  return { tipo: "altro", matched: false };
}

const UNITA_SYNONYMS: Record<string, UnitaFatturazione> = {
  pz: "pz", pezzo: "pz", pezzi: "pz", cad: "pz", cadauno: "pz", cadauni: "pz",
  n: "pz", nr: "pz", num: "pz", unita: "pz", "u": "pz",
  mq: "mq", m2: "mq", "metro quadro": "mq", "metri quadri": "mq",
  ml: "ml", "m": "ml", metro: "ml", "metro lineare": "ml", "metri lineari": "ml", mt: "ml",
  mc: "mc", m3: "mc", "metro cubo": "mc", "metri cubi": "mc",
  kg: "kg", chilo: "kg", chili: "kg", kilogrammo: "kg",
  gg: "gg", giorno: "gg", giorni: "gg", giornata: "gg", giornate: "gg", g: "gg",
  h: "h", ora: "h", ore: "h",
  "a corpo": "a_corpo", corpo: "a_corpo", forfait: "a_corpo", fisso: "a_corpo",
  acorpo: "a_corpo", "a forfait": "a_corpo",
  km: "km", "chilometro": "km", "chilometri": "km",
  piano: "piano", piani: "piano",
};

/** Mappa una stringa libera all'`UnitaFatturazione` canonica (fallback per tipo). */
export function normalizeUnita(
  raw: string,
  tipo: TipoTariffa,
): { unita: UnitaFatturazione; matched: boolean } {
  const key = normHeader(raw);
  if (!key) return { unita: UM_DEFAULT_BY_TIPO[tipo] ?? "pz", matched: false };
  if ((UNITA_FATT_VALUES as readonly string[]).includes(key.replace(/ /g, "_"))) {
    return { unita: key.replace(/ /g, "_") as UnitaFatturazione, matched: true };
  }
  const syn = UNITA_SYNONYMS[key];
  if (syn) return { unita: syn, matched: true };
  return { unita: UM_DEFAULT_BY_TIPO[tipo] ?? "pz", matched: false };
}

// ── Tipi di output ───────────────────────────────────────────────────────────

export interface ParsedPrezziarioRow {
  rowIndex: number;               // riga sorgente 1-based (header = 1)
  nome: string;
  tipo: TipoTariffa;
  unitaFatturazione: UnitaFatturazione;
  prezzoVendita: number;
  costoInterno: number | null;
  descrizione: string | null;
  errors: string[];
  warnings: string[];
}

export interface PrezziarioParseResult {
  rows: ParsedPrezziarioRow[];
  detectedColumns: Partial<Record<KnownField, number>>;
  /** Campi obbligatori (nome / prezzo_vendita) non trovati nell'intestazione. */
  missingRequired: KnownField[];
  globalErrors: string[];
}

const MAX_NOME_LEN = 120;

// ── Core puro ────────────────────────────────────────────────────────────────

/**
 * Parser puro: prende una matrice (riga 0 = intestazione) e ritorna righe
 * normalizzate + validate. Non lancia: gli errori sono nei campi `errors`.
 */
export function parsePrezziarioRows(matrix: string[][]): PrezziarioParseResult {
  const clean = (matrix ?? []).filter(
    (r) => Array.isArray(r) && r.some((c) => String(c ?? "").trim() !== ""),
  );
  if (clean.length === 0) {
    return {
      rows: [],
      detectedColumns: {},
      missingRequired: ["nome", "prezzo_vendita"],
      globalErrors: ["Il file è vuoto."],
    };
  }

  const lookup = buildAliasLookup();
  const headers = clean[0].map((h) => String(h ?? ""));
  const detected: Partial<Record<KnownField, number>> = {};
  headers.forEach((h, idx) => {
    const field = lookup.get(normHeader(h));
    if (field && detected[field] === undefined) detected[field] = idx;
  });

  // Se non c'è una colonna "nome" dedicata ma c'è "Descrizione", quella è il
  // testo principale → promuovi a nome (così un prezziario con la sola colonna
  // descrizione funziona). Niente colonna descrizione secondaria in quel caso.
  if (detected.nome === undefined && detected.descrizione !== undefined) {
    detected.nome = detected.descrizione;
    delete detected.descrizione;
  }

  const missingRequired: KnownField[] = [];
  if (detected.nome === undefined) missingRequired.push("nome");
  if (detected.prezzo_vendita === undefined) missingRequired.push("prezzo_vendita");

  const globalErrors: string[] = [];
  if (missingRequired.includes("nome")) {
    globalErrors.push(
      "Colonna nome non riconosciuta. Usa un'intestazione tipo \"Nome\", \"Voce\" o \"Descrizione\".",
    );
  }
  if (missingRequired.includes("prezzo_vendita")) {
    globalErrors.push(
      "Colonna prezzo non riconosciuta. Usa un'intestazione tipo \"Prezzo\" o \"Prezzo vendita\".",
    );
  }
  if (missingRequired.length > 0) {
    return { rows: [], detectedColumns: detected, missingRequired, globalErrors };
  }

  const at = (vals: string[], idx: number | undefined): string =>
    idx === undefined ? "" : String(vals[idx] ?? "").trim();

  const rows: ParsedPrezziarioRow[] = [];
  for (let i = 1; i < clean.length; i++) {
    const vals = clean[i];
    const errors: string[] = [];
    const warnings: string[] = [];

    const nomeRaw = at(vals, detected.nome);
    const codice = at(vals, detected.codice);

    // nome
    let nome = nomeRaw;
    if (!nome) errors.push("Nome mancante.");
    if (nome.length > MAX_NOME_LEN) {
      nome = nome.slice(0, MAX_NOME_LEN).trim();
      warnings.push(`Nome troncato a ${MAX_NOME_LEN} caratteri.`);
    }

    // prezzo (obbligatorio, > 0)
    const prezzoRaw = at(vals, detected.prezzo_vendita);
    const prezzo = parseItalianNumber(prezzoRaw);
    let prezzoVendita = 0;
    if (prezzo === null) {
      errors.push(`Prezzo non valido ("${prezzoRaw}").`);
    } else if (prezzo <= 0) {
      errors.push(`Prezzo deve essere maggiore di zero (${prezzoRaw}).`);
    } else {
      prezzoVendita = prezzo;
    }

    // costo (opzionale, >= 0)
    let costoInterno: number | null = null;
    const costoRaw = at(vals, detected.costo_interno);
    if (costoRaw) {
      const costo = parseItalianNumber(costoRaw);
      if (costo === null || costo < 0) {
        warnings.push(`Costo non valido ("${costoRaw}"), ignorato.`);
      } else {
        costoInterno = costo;
        if (prezzoVendita > 0 && costo > prezzoVendita) {
          warnings.push("Costo maggiore del prezzo: margine negativo.");
        }
      }
    }

    // tipo (opzionale)
    const tipoRaw = at(vals, detected.tipo);
    const { tipo, matched: tipoMatched } = normalizeTipo(tipoRaw);
    if (tipoRaw && !tipoMatched) {
      warnings.push(`Tipo "${tipoRaw}" non riconosciuto: impostato "altro".`);
    }

    // unità (opzionale, fallback per tipo)
    const unitaRaw = at(vals, detected.unita);
    const { unita, matched: unitaMatched } = normalizeUnita(unitaRaw, tipo);
    if (unitaRaw && !unitaMatched) {
      warnings.push(`Unità "${unitaRaw}" non riconosciuta: impostata "${unita}".`);
    }

    // descrizione (opzionale) + codice prependato
    let descrizione = at(vals, detected.descrizione) || null;
    if (codice) {
      descrizione = descrizione ? `Cod. ${codice} — ${descrizione}` : `Cod. ${codice}`;
    }

    rows.push({
      rowIndex: i + 1,
      nome,
      tipo,
      unitaFatturazione: unita,
      prezzoVendita,
      costoInterno,
      descrizione,
      errors,
      warnings,
    });
  }

  return { rows, detectedColumns: detected, missingRequired: [], globalErrors };
}

/** Statistiche aggregate per la UI di preview. */
export function summarizePrezziario(rows: ParsedPrezziarioRow[]): {
  total: number;
  valid: number;
  withErrors: number;
  withWarnings: number;
} {
  let valid = 0, withErrors = 0, withWarnings = 0;
  for (const r of rows) {
    if (r.errors.length > 0) withErrors++;
    else valid++;
    if (r.warnings.length > 0) withWarnings++;
  }
  return { total: rows.length, valid, withErrors, withWarnings };
}

// ── Payload per insert in tariffe_aziendali ──────────────────────────────────

export interface TariffaImportPayload {
  company_id: string;
  nome: string;
  descrizione: string | null;
  tipo: TipoTariffa;
  unita: string;                 // legacy column
  unita_fatturazione: UnitaFatturazione;
  vertical_associato: null;
  prezzo_vendita: number;
  attivo: true;
  costo_interno?: number;
  prezzo_costo?: number;
}

/**
 * Converte una riga valida nel payload insert per `tariffe_aziendali`.
 * Rispecchia lo shape usato da StandardTariffeDialog.handleCreate().
 * `includeCosto=false` (utente non admin) → omette costo_interno/prezzo_costo.
 */
export function toImportPayload(
  row: ParsedPrezziarioRow,
  opts: { companyId: string; includeCosto: boolean },
): TariffaImportPayload {
  const payload: TariffaImportPayload = {
    company_id: opts.companyId,
    nome: row.nome,
    descrizione: row.descrizione,
    tipo: row.tipo,
    unita: legacyUnitaFrom(row.unitaFatturazione),
    unita_fatturazione: row.unitaFatturazione,
    vertical_associato: null,
    prezzo_vendita: row.prezzoVendita,
    attivo: true,
  };
  if (opts.includeCosto && row.costoInterno !== null) {
    payload.costo_interno = row.costoInterno;
    payload.prezzo_costo = row.costoInterno;
  }
  return payload;
}

// ── Template CSV scaricabile ─────────────────────────────────────────────────

/** Genera un CSV di esempio con intestazioni riconosciute + 2 righe demo. */
export function buildPrezziarioTemplateCsv(): string {
  return Papa.unparse(
    {
      fields: ["Codice", "Nome", "Tipo", "Unità", "Prezzo vendita", "Costo interno", "Descrizione"],
      data: [
        ["NP.01.001", "Posa pavimento gres", "posa", "mq", "22,00", "14,00", "Gres su sottofondo pronto"],
        ["NP.02.010", "Manodopera specializzata", "manodopera", "h", "60,00", "40,00", "Operaio qualificato"],
      ],
    },
    { delimiter: ";" },
  );
}

/** Forma minima per esportare una tariffa (disaccoppiata dal tipo della pagina). */
export interface TariffaExportInput {
  nome: string;
  descrizione?: string | null;
  tipo: string;
  unita_fatturazione?: string | null;
  unita?: string | null;
  prezzo_vendita?: number | null;
  costo_interno?: number | null;
  prezzo_costo?: number | null;
}

/**
 * Serializza un elenco di tariffe in CSV (delimitatore `;`, decimali IT con
 * virgola), con le STESSE intestazioni del template di import → round-trip
 * garantito (esporta, modifica, re-importa). La colonna "Costo interno" è
 * inclusa solo se `includeCosto` (riservata agli admin).
 */
export function buildTariffeExportCsv(
  rows: TariffaExportInput[],
  opts: { includeCosto: boolean },
): string {
  const fmt = (n: number | null | undefined): string =>
    n === null || n === undefined || !Number.isFinite(n)
      ? ""
      : Number(n).toFixed(2).replace(".", ",");
  const fields = opts.includeCosto
    ? ["Nome", "Tipo", "Unità", "Prezzo vendita", "Costo interno", "Descrizione"]
    : ["Nome", "Tipo", "Unità", "Prezzo vendita", "Descrizione"];
  const data = rows.map((r) => {
    const um = (r.unita_fatturazione ?? r.unita ?? "") as string;
    const base = [
      neutralizeCsvFormula(r.nome ?? ""),
      neutralizeCsvFormula(r.tipo ?? ""),
      neutralizeCsvFormula(um),
      fmt(r.prezzo_vendita),
    ];
    return opts.includeCosto
      ? [...base, fmt(r.costo_interno ?? r.prezzo_costo), neutralizeCsvFormula(r.descrizione ?? "")]
      : [...base, neutralizeCsvFormula(r.descrizione ?? "")];
  });
  return Papa.unparse({ fields, data }, { delimiter: ";" });
}

// ── Wrapper file (impuri) ────────────────────────────────────────────────────

/** Auto-rileva CSV vs Excel dal nome/MIME e fa il parsing. */
export async function parsePrezziarioFile(file: File): Promise<PrezziarioParseResult> {
  const lower = file.name.toLowerCase();
  const isCsv = lower.endsWith(".csv") || file.type === "text/csv";
  if (isCsv) return parsePrezziarioCsv(await file.text());
  return parsePrezziarioExcel(await file.arrayBuffer());
}

export function parsePrezziarioCsv(text: string): PrezziarioParseResult {
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
  const matrix = (parsed.data as string[][]).filter(
    (r) => Array.isArray(r) && r.some((c) => String(c ?? "").trim() !== ""),
  );
  return parsePrezziarioRows(matrix);
}

export async function parsePrezziarioExcel(buffer: ArrayBuffer): Promise<PrezziarioParseResult> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheet = wb.getWorksheet("Dati") ?? wb.worksheets[0];
  if (!sheet) return parsePrezziarioRows([]);

  const matrix: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const vals: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const raw = cell.value;
      let str: string;
      if (raw === null || raw === undefined) {
        str = "";
      } else if (typeof raw === "object" && "richText" in (raw as object)) {
        str = (raw as { richText: { text: string }[] }).richText.map((r) => r.text).join("");
      } else if (typeof raw === "object" && "result" in (raw as object)) {
        str = ((raw as { result: unknown }).result ?? "").toString();
      } else if (raw instanceof Date) {
        str = raw.toISOString().slice(0, 10);
      } else {
        str = raw.toString();
      }
      vals[colNumber - 1] = str;
    });
    matrix.push(vals);
  });
  return parsePrezziarioRows(matrix);
}
