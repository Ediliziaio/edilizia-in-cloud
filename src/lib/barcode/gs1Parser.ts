/**
 * Parser GS1-128 / GS1-QR minimale per edilizia/fotovoltaico.
 *
 * Application Identifiers (AI) supportati:
 *   01  (14 cifre fisse)            → GTIN
 *   10  (variable, FNC1)            → Lot number
 *   17  (6 cifre YYMMDD)            → Expiry date
 *   21  (variable, FNC1)            → Serial number
 *   240 (variable, FNC1)            → Additional product ID
 *
 * FNC1 separator: ASCII 29 (GS). Nei QR scansionati spesso assente
 * (desunto da fine campo variable-length).
 *
 * Zero dipendenze esterne.
 */

export interface Gs1ParseResult {
  /** True se almeno un AI è stato riconosciuto. */
  isGs1: boolean;
  gtin?: string;
  serialNumber?: string;
  lotNumber?: string;
  /** YYYY-MM-DD, calcolato da AI 17. */
  expiryDate?: string;
  rawAis: Record<string, string>;
  raw: string;
}

const FIXED_LENGTH_AIS: Record<string, number> = {
  "00": 18, "01": 14, "02": 14,
  "11": 6, "12": 6, "13": 6, "15": 6, "16": 6, "17": 6,
  "20": 2, "422": 3, "424": 3,
};

const VARIABLE_LENGTH_AIS = new Set([
  "10", "21", "22", "240", "241", "250", "251", "400", "401", "402",
  "403", "8004", "8005", "8020",
]);

export const FNC1 = String.fromCharCode(29);

function detectAi(s: string, pos: number): { ai: string; length: number } | null {
  const p2 = s.slice(pos, pos + 2);
  const p3 = s.slice(pos, pos + 3);
  const p4 = s.slice(pos, pos + 4);
  if (FIXED_LENGTH_AIS[p4] !== undefined || VARIABLE_LENGTH_AIS.has(p4)) {
    return { ai: p4, length: 4 };
  }
  if (FIXED_LENGTH_AIS[p3] !== undefined || VARIABLE_LENGTH_AIS.has(p3)) {
    return { ai: p3, length: 3 };
  }
  if (FIXED_LENGTH_AIS[p2] !== undefined || VARIABLE_LENGTH_AIS.has(p2)) {
    return { ai: p2, length: 2 };
  }
  return null;
}

function parseExpiry(yymmdd: string): string | undefined {
  if (!/^\d{6}$/.test(yymmdd)) return undefined;
  const yy = parseInt(yymmdd.slice(0, 2), 10);
  const mm = yymmdd.slice(2, 4);
  const dd = yymmdd.slice(4, 6);
  // Edilizia: assumiamo sempre 20XX (no rolling-window 2050+)
  const year = 2000 + yy;
  if (dd === "00") {
    // GS1 spec: dd=00 significa "ultimo giorno del mese".
    // Uso getFullYear/getMonth/getDate (local) invece di toISOString()
    // per evitare lo shift di timezone che restituirebbe il giorno prima.
    const d = new Date(year, parseInt(mm, 10), 0);
    const yyyy = d.getFullYear();
    const mmStr = String(d.getMonth() + 1).padStart(2, "0");
    const ddStr = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mmStr}-${ddStr}`;
  }
  return `${year}-${mm}-${dd}`;
}

export function parseGs1(raw: string): Gs1ParseResult {
  const rawAis: Record<string, string> = {};
  const s = raw.trim();
  let pos = 0;
  let safety = 0;

  while (pos < s.length && safety++ < 50) {
    // Skip FNC1 separator se presente: lo standard lo richiede solo dopo
    // variable-length AI, ma molti encoder reali lo inseriscono anche
    // dopo fixed-length. Skip difensivo qui copre entrambi i casi.
    while (s[pos] === FNC1) pos++;
    if (pos >= s.length) break;

    const det = detectAi(s, pos);
    if (!det) break;
    const aiStart = pos + det.length;
    let value: string;

    if (FIXED_LENGTH_AIS[det.ai] !== undefined) {
      const len = FIXED_LENGTH_AIS[det.ai];
      value = s.slice(aiStart, aiStart + len);
      pos = aiStart + len;
    } else if (VARIABLE_LENGTH_AIS.has(det.ai)) {
      const fncIdx = s.indexOf(FNC1, aiStart);
      if (fncIdx === -1) {
        value = s.slice(aiStart);
        pos = s.length;
      } else {
        value = s.slice(aiStart, fncIdx);
        pos = fncIdx + 1;
      }
    } else break;

    if (value.length === 0) break;
    rawAis[det.ai] = value;
  }

  const isGs1 = Object.keys(rawAis).length > 0;
  return {
    isGs1,
    gtin: rawAis["01"],
    serialNumber: rawAis["21"],
    lotNumber: rawAis["10"],
    expiryDate: rawAis["17"] ? parseExpiry(rawAis["17"]) : undefined,
    rawAis,
    raw,
  };
}

/**
 * Decide se parsare una stringa come GS1.
 * Usa la config supplier (uses_gs1) come hint primario, poi euristica.
 */
export function shouldParseAsGs1(raw: string, supplierUsesGs1?: boolean): boolean {
  if (supplierUsesGs1) return true;
  // AI 01 (GTIN) all'inizio è il pattern GS1 più riconoscibile
  if (/^01\d{14}/.test(raw)) return true;
  if (raw.includes(FNC1)) return true;
  return false;
}

/**
 * Ritorna la chiave principale per il lookup RPC (serial > gtin > raw).
 * Usata da BarcodeScanner per costruire l'input di warehouse_scan_lookup.
 */
export function normalizeScanForLookup(
  raw: string,
  supplierUsesGs1?: boolean,
): { primary: string; gs1?: Gs1ParseResult } {
  if (!shouldParseAsGs1(raw, supplierUsesGs1)) {
    return { primary: raw.trim() };
  }
  const gs1 = parseGs1(raw);
  const primary = gs1.serialNumber || gs1.gtin || raw.trim();
  return { primary, gs1 };
}
