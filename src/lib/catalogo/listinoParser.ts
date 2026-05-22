/**
 * Sprint C — Catalogo Esteso
 * Parser per file Excel/CSV in fase di import listini.
 *
 * Espone:
 *  - parseListinoFile(file, {objectType, customFields}): Promise<ParsedRow[]>
 *  - normalizeRow: mappa header → keys fisse o cf:<id>
 *  - validateRow: ritorna errori di validazione
 *  - computeFuzzyCategoryMatches: Levenshtein fuzzy match per matching categorie
 */
import Papa from "papaparse";
import type { CompanyCustomFieldDef, CatalogObjectType } from "@/hooks/useCompanyCustomFields";
import { FIXED_COLUMNS } from "./listinoTemplate";

export interface ParsedRow {
  rowIndex: number;
  raw: Record<string, string>;
  normalized: Record<string, unknown>;
  customFieldValues: Record<string, unknown>;
  errors: string[];
  warnings: string[];
}

export interface ParseOpts {
  objectType: CatalogObjectType;
  customFields?: CompanyCustomFieldDef[];
}

/** Distanza di Levenshtein fra 2 stringhe (ratio 0..1). */
export function levenshteinRatio(a: string, b: string): number {
  const s = (a ?? "").toLowerCase().trim();
  const t = (b ?? "").toLowerCase().trim();
  if (!s && !t) return 1;
  if (!s || !t) return 0;
  const m = s.length;
  const n = t.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  const dist = dp[m][n];
  const maxLen = Math.max(m, n);
  return maxLen === 0 ? 1 : 1 - dist / maxLen;
}

/** Ritorna le top-3 corrispondenze fuzzy (>= threshold) su una lista. */
export function computeFuzzyCategoryMatches(
  input: string,
  candidates: string[],
  threshold = 0.6,
  topN = 3,
): { value: string; score: number }[] {
  return candidates
    .map((c) => ({ value: c, score: levenshteinRatio(input, c) }))
    .filter((x) => x.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

/** Normalizza header stringa → lookup key case-insensitive, spazi → _. */
function headerKey(h: string): string {
  return (h ?? "").toLowerCase().trim().replace(/\s*\*\s*$/, "").replace(/\s*\(.+?\)\s*$/, "").replace(/\s+/g, "_");
}

/** Costruisce la mappa header → (type=fixed|cf, key|id). */
function buildHeaderMap(
  headers: string[],
  opts: ParseOpts,
): Map<number, { kind: "fixed" | "cf"; key: string; def?: CompanyCustomFieldDef; fixedDef?: { key: string; label: string; required?: boolean } }> {
  const { objectType, customFields = [] } = opts;
  const fixed = FIXED_COLUMNS[objectType];
  const m = new Map<number, { kind: "fixed" | "cf"; key: string; def?: CompanyCustomFieldDef; fixedDef?: { key: string; label: string; required?: boolean } }>();
  headers.forEach((h, idx) => {
    const hk = headerKey(h);
    const fx = fixed.find((c) => headerKey(c.label) === hk || c.key === hk);
    if (fx) {
      m.set(idx, { kind: "fixed", key: fx.key, fixedDef: fx });
      return;
    }
    const cf = customFields.find((f) => headerKey(f.name) === hk);
    if (cf) {
      m.set(idx, { kind: "cf", key: cf.id, def: cf });
    }
  });
  return m;
}

/** Converte un valore stringa al tipo di un custom field. */
function coerceCfValue(raw: string, def: CompanyCustomFieldDef): { value: unknown; error?: string } {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { value: null };
  switch (def.field_type) {
    case "number": {
      const n = Number(trimmed.replace(",", "."));
      if (!Number.isFinite(n)) return { value: trimmed, error: `"${def.name}": valore non numerico` };
      return { value: n };
    }
    case "date": {
      // Accetta AAAA-MM-GG
      if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        return { value: trimmed, error: `"${def.name}": data deve essere AAAA-MM-GG` };
      }
      return { value: trimmed };
    }
    case "select": {
      if (def.options && def.options.length && !def.options.includes(trimmed)) {
        return { value: trimmed, error: `"${def.name}": valore "${trimmed}" non ammesso` };
      }
      return { value: trimmed };
    }
    default:
      return { value: trimmed };
  }
}

/** Converte una row raw in row normalizzata+validata. */
function buildRow(
  rowIdx: number,
  headers: string[],
  values: string[],
  hmap: ReturnType<typeof buildHeaderMap>,
  opts: ParseOpts,
): ParsedRow {
  const raw: Record<string, string> = {};
  const normalized: Record<string, unknown> = {};
  const customFieldValues: Record<string, unknown> = {};
  const errors: string[] = [];
  const warnings: string[] = [];
  const fixed = FIXED_COLUMNS[opts.objectType];

  headers.forEach((h, i) => {
    raw[h] = (values[i] ?? "").toString();
  });

  hmap.forEach((mapping, idx) => {
    const vRaw = (values[idx] ?? "").toString().trim();
    if (mapping.kind === "fixed") {
      if (!vRaw && mapping.fixedDef?.required) {
        errors.push(`Campo obbligatorio mancante: "${mapping.fixedDef.label}"`);
      }
      // Number coercion per campi noti
      const numberFields = new Set([
        "base_price",
        "list_price",
        "cost",
        "margin_pct",
        "vat_rate",
        "costo_orario",
        "prezzo_orario",
        "margine_pct",
        "ore_giornaliere",
        "default_margin_pct",
        "default_markup_pct",
      ]);
      if (numberFields.has(mapping.key) && vRaw) {
        const n = Number(vRaw.replace(",", "."));
        if (!Number.isFinite(n)) {
          errors.push(`"${mapping.fixedDef?.label}": valore non numerico ("${vRaw}")`);
          normalized[mapping.key] = vRaw;
        } else {
          normalized[mapping.key] = n;
        }
      } else {
        normalized[mapping.key] = vRaw || null;
      }
    } else if (mapping.kind === "cf" && mapping.def) {
      const { value, error } = coerceCfValue(vRaw, mapping.def);
      if (error) warnings.push(error);
      if (value !== null && value !== undefined && value !== "") {
        customFieldValues[mapping.def.id] = value;
      }
    }
  });

  // Assicura che tutte le colonne fisse required siano presenti come chiavi anche se mancanti
  fixed.forEach((c) => {
    if (!(c.key in normalized)) normalized[c.key] = null;
  });

  return {
    rowIndex: rowIdx,
    raw,
    normalized,
    customFieldValues,
    errors,
    warnings,
  };
}

/** Parser principale: auto-rileva Excel vs CSV dal nome file/MIME. */
export async function parseListinoFile(file: File, opts: ParseOpts): Promise<ParsedRow[]> {
  const lower = file.name.toLowerCase();
  const isCsv = lower.endsWith(".csv") || file.type === "text/csv";
  if (isCsv) return parseCsv(await file.text(), opts);
  return parseExcel(await file.arrayBuffer(), opts);
}

export function parseCsv(text: string, opts: ParseOpts): ParsedRow[] {
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
  const rows: string[][] = (parsed.data as string[][]).filter((r) => Array.isArray(r) && r.some((c) => (c ?? "").toString().trim() !== ""));
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => (h ?? "").toString());
  const hmap = buildHeaderMap(headers, opts);
  const out: ParsedRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    out.push(buildRow(i + 1, headers, rows[i], hmap, opts));
  }
  return out;
}

export async function parseExcel(buffer: ArrayBuffer, opts: ParseOpts): Promise<ParsedRow[]> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  // Preferisce foglio "Dati", altrimenti il primo foglio
  const sheet = wb.getWorksheet("Dati") ?? wb.worksheets[0];
  if (!sheet) return [];
  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber - 1] = (cell.value ?? "").toString();
  });
  const hmap = buildHeaderMap(headers, opts);
  const out: ParsedRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const vals: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const raw = cell.value;
      let str = "";
      if (raw === null || raw === undefined) {
        str = "";
      } else if (typeof raw === "object" && "richText" in (raw as object)) {
        str = (raw as { richText: { text: string }[] }).richText.map((r) => r.text).join("");
      } else if (typeof raw === "object" && "result" in (raw as object)) {
        // Formula
        str = ((raw as { result: unknown }).result ?? "").toString();
      } else if (raw instanceof Date) {
        str = raw.toISOString().slice(0, 10);
      } else {
        str = raw.toString();
      }
      vals[colNumber - 1] = str;
    });
    // Scarta righe tutte vuote
    if (vals.every((v) => !v || v.trim() === "")) return;
    out.push(buildRow(rowNumber, headers, vals, hmap, opts));
  });
  return out;
}

/** Aggrega statistiche per la UI di preview. */
export function summarizeParsedRows(rows: ParsedRow[]): {
  total: number;
  valid: number;
  withErrors: number;
  withWarnings: number;
} {
  let valid = 0;
  let withErrors = 0;
  let withWarnings = 0;
  for (const r of rows) {
    if (r.errors.length > 0) withErrors++;
    else valid++;
    if (r.warnings.length > 0) withWarnings++;
  }
  return { total: rows.length, valid, withErrors, withWarnings };
}
