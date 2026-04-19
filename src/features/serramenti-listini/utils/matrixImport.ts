/**
 * STEP 5 — Parser matrix file (Excel/CSV) per import massivo listino_griglia.
 *
 * Schema atteso (formato "pivot"):
 *
 *     |        | 1000  | 1200  | 1500  |
 *     |--------|-------|-------|-------|
 *     |  1000  | 150   | 175   | 210   |
 *     |  1200  | 180   | 210   | 252   |
 *     |  1500  | 225   | 263   | 315   |
 *
 * - Cella A1 = ignorata (header "L×H" o simile).
 * - Riga 1 (B1..): valori X (larghezze in mm, interi positivi).
 * - Colonna A (A2..): valori Y (altezze in mm, interi positivi).
 * - Celle interne: prezzi LISTINO (€ pre-sconto, numeri decimali ≥ 0).
 * - Celle vuote / non numeriche / ≤ 0 → ignorate (NON salvate).
 *
 * Separatore CSV: auto-detect `;` o `,` dalla prima riga.
 *
 * Output tipato: { xValues, yValues, cells[] } → pronto per upsert loop.
 *
 * Sicurezza: max 10MB file, max 100×100 celle (10k → warning e troncato).
 * Testabile senza browser (fornisci stringa CSV direttamente).
 */

export interface MatrixParseCell {
  valore_x: number;
  valore_y: number;
  prezzo_listino: number;
}

export interface MatrixParseResult {
  xValues: number[];
  yValues: number[];
  cells: MatrixParseCell[];
  warnings: string[];
}

/** Limiti difensivi */
export const MATRIX_IMPORT_LIMITS = {
  MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024, // 10 MB
  MAX_ROWS: 100,
  MAX_COLS: 100,
  /** Range misure accettate (mm). Oltre → warning, non errore. */
  MIN_MM: 100,
  MAX_MM: 5000,
  /** Prezzo max singola cella (€) — guardrail contro typo tipo "1500000" */
  MAX_PRICE_EUR: 1_000_000,
} as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Parse numero tollerante: supporta `1.234,56` (IT) e `1,234.56` (EN). */
export function parseLooseNumber(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const s = String(raw).trim();
  if (!s) return null;
  // Rimuove spazi e simboli valuta comuni
  const cleaned = s.replace(/[€$£\s]/g, "");
  // Caso italiano: migliaia con "." e decimali con ","
  // Se c'è almeno una virgola E almeno un punto, assumiamo IT (punto=migliaia).
  // Se c'è solo virgola → IT decimal.
  // Se c'è solo punto → EN decimal.
  let normalized: string;
  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");
  if (hasComma && hasDot) {
    // Distinguiamo per posizione: l'ultimo simbolo è il decimal.
    const lastComma = cleaned.lastIndexOf(",");
    const lastDot = cleaned.lastIndexOf(".");
    if (lastComma > lastDot) {
      // IT: . migliaia, , decimale
      normalized = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      // EN: , migliaia, . decimale
      normalized = cleaned.replace(/,/g, "");
    }
  } else if (hasComma) {
    normalized = cleaned.replace(",", ".");
  } else {
    normalized = cleaned;
  }
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Parse intero positivo (per larghezze/altezze). */
export function parsePositiveInt(raw: unknown): number | null {
  const n = parseLooseNumber(raw);
  if (n == null) return null;
  const i = Math.round(n);
  return i > 0 ? i : null;
}

// ─── CSV parser ──────────────────────────────────────────────────────────────

/** Rileva separatore CSV contando occorrenze in prima riga. */
export function detectCsvSeparator(firstLine: string): "," | ";" | "\t" {
  const semi = (firstLine.match(/;/g) ?? []).length;
  const comma = (firstLine.match(/,/g) ?? []).length;
  const tab = (firstLine.match(/\t/g) ?? []).length;
  const max = Math.max(semi, comma, tab);
  if (max === 0) return ",";
  if (tab === max) return "\t";
  if (semi >= comma) return ";";
  return ",";
}

/** Parse stringa CSV in matrice di stringhe. Tollerante a quote. */
export function parseCsvMatrix(text: string): string[][] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const sep = detectCsvSeparator(lines[0]);
  return lines.map((line) => {
    const result: string[] = [];
    let inQuote = false;
    let current = "";
    for (const ch of line) {
      if (ch === '"') {
        inQuote = !inQuote;
        continue;
      }
      if (ch === sep && !inQuote) {
        result.push(current.trim());
        current = "";
        continue;
      }
      current += ch;
    }
    result.push(current.trim());
    return result;
  });
}

// ─── Matrix → cells ──────────────────────────────────────────────────────────

/**
 * Converte una matrice raw (string[][]) in cells tipate.
 * Applica lo schema pivot descritto in testa al file.
 *
 * Pure function — nessun I/O. Testabile con vitest.
 */
export function matrixToCells(raw: (string | number | null | undefined)[][]): MatrixParseResult {
  const warnings: string[] = [];

  if (raw.length === 0) {
    return { xValues: [], yValues: [], cells: [], warnings: ["File vuoto"] };
  }

  // Trunc difensivo
  const rows =
    raw.length > MATRIX_IMPORT_LIMITS.MAX_ROWS
      ? raw.slice(0, MATRIX_IMPORT_LIMITS.MAX_ROWS)
      : raw;
  if (raw.length > MATRIX_IMPORT_LIMITS.MAX_ROWS) {
    warnings.push(
      `Troncate a ${MATRIX_IMPORT_LIMITS.MAX_ROWS} righe (erano ${raw.length})`,
    );
  }

  // Header riga X — rows[0] da colonna 1
  const headerRow = rows[0];
  if (headerRow.length <= 1) {
    return {
      xValues: [],
      yValues: [],
      cells: [],
      warnings: ["Intestazione larghezze vuota (deve essere la prima riga da B1)"],
    };
  }

  const maxCols = Math.min(headerRow.length, MATRIX_IMPORT_LIMITS.MAX_COLS + 1);
  if (headerRow.length > MATRIX_IMPORT_LIMITS.MAX_COLS + 1) {
    warnings.push(
      `Troncate a ${MATRIX_IMPORT_LIMITS.MAX_COLS} colonne (erano ${headerRow.length - 1})`,
    );
  }

  // Mapping colIdx → xValue (in mm). Scartiamo colonne non numeriche.
  const colIndexToX: Map<number, number> = new Map();
  for (let c = 1; c < maxCols; c++) {
    const x = parsePositiveInt(headerRow[c]);
    if (x == null) continue; // ignora header non-numerici
    if (x < MATRIX_IMPORT_LIMITS.MIN_MM || x > MATRIX_IMPORT_LIMITS.MAX_MM) {
      warnings.push(
        `Larghezza ${x} mm fuori range consigliato (${MATRIX_IMPORT_LIMITS.MIN_MM}–${MATRIX_IMPORT_LIMITS.MAX_MM})`,
      );
    }
    colIndexToX.set(c, x);
  }

  if (colIndexToX.size === 0) {
    return {
      xValues: [],
      yValues: [],
      cells: [],
      warnings: [...warnings, "Nessuna larghezza numerica trovata nella prima riga"],
    };
  }

  // Parsing celle
  const xValuesSet = new Set<number>();
  const yValuesSet = new Set<number>();
  const cells: MatrixParseCell[] = [];
  const seenDupes = new Set<string>();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;
    const y = parsePositiveInt(row[0]);
    if (y == null) continue; // salto righe senza altezza numerica
    if (y < MATRIX_IMPORT_LIMITS.MIN_MM || y > MATRIX_IMPORT_LIMITS.MAX_MM) {
      warnings.push(
        `Altezza ${y} mm fuori range consigliato (${MATRIX_IMPORT_LIMITS.MIN_MM}–${MATRIX_IMPORT_LIMITS.MAX_MM})`,
      );
    }

    for (const [colIdx, x] of colIndexToX) {
      const rawPrice = row[colIdx];
      const price = parseLooseNumber(rawPrice);
      if (price == null || price <= 0) continue; // cella vuota o 0 → skip
      if (price > MATRIX_IMPORT_LIMITS.MAX_PRICE_EUR) {
        warnings.push(
          `Prezzo ${x}×${y} = ${price} € sembra fuori scala, ignorato (max ${MATRIX_IMPORT_LIMITS.MAX_PRICE_EUR})`,
        );
        continue;
      }
      const key = `${x}_${y}`;
      if (seenDupes.has(key)) {
        warnings.push(`Duplicato ${x}×${y}: tenuta la prima occorrenza`);
        continue;
      }
      seenDupes.add(key);
      xValuesSet.add(x);
      yValuesSet.add(y);
      cells.push({ valore_x: x, valore_y: y, prezzo_listino: price });
    }
  }

  return {
    xValues: Array.from(xValuesSet).sort((a, b) => a - b),
    yValues: Array.from(yValuesSet).sort((a, b) => a - b),
    cells,
    warnings,
  };
}

// ─── File I/O (browser side) ─────────────────────────────────────────────────

/**
 * Legge un File (Excel o CSV) e restituisce una matrice raw string[][].
 * Dynamic import di exceljs per evitare di pesare sul bundle se non usato.
 *
 * SICUREZZA: verifica dimensione file prima di parsare (DoS prevention).
 */
export async function readFileToMatrix(file: File): Promise<(string | number | null)[][]> {
  if (file.size > MATRIX_IMPORT_LIMITS.MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `File troppo grande: massimo ${MATRIX_IMPORT_LIMITS.MAX_FILE_SIZE_BYTES / 1024 / 1024} MB`,
    );
  }

  const name = file.name.toLowerCase();
  const isCsv = name.endsWith(".csv") || name.endsWith(".tsv") || name.endsWith(".txt");

  if (isCsv) {
    const text = await file.text();
    return parseCsvMatrix(text);
  }

  // Excel path
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const buffer = await file.arrayBuffer();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("Foglio Excel vuoto");

  const result: (string | number | null)[][] = [];
  ws.eachRow({ includeEmpty: true }, (row) => {
    const r: (string | number | null)[] = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      while (r.length < colNumber - 1) r.push(null);
      const v = cell.value;
      if (v == null) {
        r.push(null);
      } else if (typeof v === "object" && "result" in v) {
        // Formula cell
        const res = (v as { result?: unknown }).result;
        r.push(typeof res === "number" ? res : res == null ? null : String(res));
      } else if (typeof v === "number" || typeof v === "string") {
        r.push(v);
      } else {
        r.push(String(v));
      }
    });
    result.push(r);
  });

  return result;
}

/**
 * Pipeline completa: File → cells tipate.
 * Helper top-level usato dal dialog — compone readFileToMatrix + matrixToCells.
 */
export async function parseMatrixFile(file: File): Promise<MatrixParseResult> {
  const raw = await readFileToMatrix(file);
  return matrixToCells(raw);
}
