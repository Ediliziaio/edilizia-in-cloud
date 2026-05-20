/**
 * multiSerialParser — v8.6.106
 *
 * Riconosce QR/barcode che contengono una LISTA di seriali (es. QR del lotto/
 * pallet fotovoltaico Hyundai/Q.Cells/SunPower con dentro 30+ seriali).
 *
 * Formati supportati:
 *   1. CSV:        "1234567890,1234567891,1234567892"
 *   2. Newline:    "SN-001\nSN-002\nSN-003" (o \r\n)
 *   3. Semicolon:  "SN1;SN2;SN3"
 *   4. JSON array: '["SN1","SN2","SN3"]'
 *   5. JSON obj:   '{"sn":["..."],"qty":N}' o '{"serials":["..."]}' o '{"items":[...]}'
 *   6. GS1 multi:  "0193..21SN001\x1d21SN002\x1d21SN003" (AI 21 ripetuto con FNC1)
 *
 * Soglia minima: 2 seriali per considerarlo multi-serial. Sotto, ricade nel
 * lookup standard.
 *
 * Vincoli sicurezza:
 *   - MAX_SERIALS = 500 (oltre, taglia e warning)
 *   - MIN_SERIAL_LENGTH = 4 (filtra rumore)
 *   - MAX_SERIAL_LENGTH = 100 (filtra junk)
 *
 * Ritorna null se NON è multi-serial (consumer fa lookup standard).
 */

export interface MultiSerialResult {
  serials: string[];
  format: "csv" | "newline" | "semicolon" | "space" | "json-array" | "json-object" | "gs1-multi";
  /** Per JSON object: eventuali metadata estratti (es. qty dichiarata) */
  declaredQty?: number;
  /** GTIN se presente nei dati (formato gs1-multi o json-object) */
  gtin?: string;
  /** Lotto se presente */
  lot?: string;
}

const MAX_SERIALS = 500;
const MIN_SERIAL_LENGTH = 4;
const MAX_SERIAL_LENGTH = 100;
const FNC1 = String.fromCharCode(29);

/**
 * Sanitizza una stringa-candidato seriale.
 * Ritorna null se non valida (vuota, troppo corta, troppo lunga, junk).
 */
function cleanSerial(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const trimmed = s.trim();
  if (trimmed.length < MIN_SERIAL_LENGTH || trimmed.length > MAX_SERIAL_LENGTH) {
    return null;
  }
  // Filtra stringhe palesemente non-seriali (es. URL, frasi)
  if (/^https?:\/\//i.test(trimmed)) return null;
  if (/\s\s/.test(trimmed)) return null; // più spazi consecutivi = frase
  return trimmed;
}

function dedupeAndCap(serials: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of serials) {
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= MAX_SERIALS) break;
  }
  return out;
}

// ─── Parser 1: JSON ─────────────────────────────────────────────────────────
function tryParseJson(raw: string): MultiSerialResult | null {
  const t = raw.trim();
  if (!t.startsWith("{") && !t.startsWith("[")) return null;
  try {
    const obj = JSON.parse(t);
    // JSON array diretto
    if (Array.isArray(obj)) {
      const serials = dedupeAndCap(
        obj.map(cleanSerial).filter((s): s is string => s !== null),
      );
      if (serials.length < 2) return null;
      return { serials, format: "json-array" };
    }
    // JSON object con campo sn/serials/items
    if (typeof obj === "object" && obj !== null) {
      const o = obj as Record<string, unknown>;
      const candidate =
        (Array.isArray(o.sn) && o.sn) ||
        (Array.isArray(o.serials) && o.serials) ||
        (Array.isArray(o.serial_numbers) && o.serial_numbers) ||
        (Array.isArray(o.items) && o.items);
      if (!candidate) return null;
      const serials = dedupeAndCap(
        (candidate as unknown[]).map((item) => {
          // items[] può essere ["SN"] o [{sn:"SN"}]
          if (typeof item === "string") return cleanSerial(item);
          if (typeof item === "object" && item !== null) {
            const i = item as Record<string, unknown>;
            return cleanSerial(i.sn ?? i.serial ?? i.serial_number ?? i.id);
          }
          return null;
        }).filter((s): s is string => s !== null),
      );
      if (serials.length < 2) return null;
      return {
        serials,
        format: "json-object",
        declaredQty: typeof o.qty === "number" ? o.qty : (typeof o.quantity === "number" ? o.quantity : undefined),
        gtin: typeof o.gtin === "string" ? o.gtin : undefined,
        lot: typeof o.lot === "string" ? o.lot : (typeof o.lotto === "string" ? o.lotto : undefined),
      };
    }
  } catch {
    // Non era JSON valido
  }
  return null;
}

// ─── Parser 2: GS1 con AI 21 ripetuto ───────────────────────────────────────
function tryParseGs1Multi(raw: string): MultiSerialResult | null {
  // Pattern: stringa che contiene FNC1 e ha AI 01 (GTIN) + multiple AI 21 (Serial)
  // Es: "0193...21SN001\x1d21SN002\x1d21SN003"
  if (!raw.includes(FNC1)) return null;
  const segments = raw.split(FNC1);
  const serials: string[] = [];
  let gtin: string | undefined;
  let lot: string | undefined;
  for (const seg of segments) {
    if (seg.startsWith("01") && seg.length >= 16) {
      gtin = seg.slice(2, 16);
    } else if (seg.startsWith("21")) {
      const s = cleanSerial(seg.slice(2));
      if (s) serials.push(s);
    } else if (seg.startsWith("10")) {
      lot = seg.slice(2).trim() || undefined;
    }
  }
  if (serials.length < 2) return null;
  return {
    serials: dedupeAndCap(serials),
    format: "gs1-multi",
    gtin,
    lot,
  };
}

// ─── Parser 3: separatori comuni (CSV, newline, semicolon, space) ─────────
function trySplitParser(raw: string): MultiSerialResult | null {
  const t = raw.trim();

  // Newline split
  if (/\r?\n/.test(t)) {
    const parts = t.split(/\r?\n/).map(cleanSerial).filter((s): s is string => s !== null);
    if (parts.length >= 2) {
      return { serials: dedupeAndCap(parts), format: "newline" };
    }
  }

  // CSV (priorità: comma)
  if (t.includes(",")) {
    const parts = t.split(",").map(cleanSerial).filter((s): s is string => s !== null);
    // Almeno 2 parti, e la cardinalità degli "elementi puliti" deve essere
    // > 60% del numero di virgole (filtra frasi con virgole)
    const commas = (t.match(/,/g) ?? []).length;
    if (parts.length >= 2 && parts.length >= commas * 0.6) {
      return { serials: dedupeAndCap(parts), format: "csv" };
    }
  }

  // Semicolon
  if (t.includes(";")) {
    const parts = t.split(";").map(cleanSerial).filter((s): s is string => s !== null);
    if (parts.length >= 2) {
      return { serials: dedupeAndCap(parts), format: "semicolon" };
    }
  }

  // v8.6.107 — SPACE separator (caso Hyundai/Q.Cells/SunPower fotovoltaico).
  // Es. QR bancale Hyundai HiE-S500VG: "V12H10024490 V12H10023676 V12H10024432 ..."
  //
  // Lo spazio e' ambiguo (puo essere parte di una frase) -> regole stringenti:
  //   1. Tutti i token devono passare cleanSerial (no junk)
  //   2. Almeno 90% dei token deve avere LUNGHEZZA UGUALE (i seriali di un
  //      pallet sono solitamente lunghezza fissa, es. tutti 12 char Hyundai)
  //   3. Almeno 5 token validi (sotto e' meglio fallback al lookup standard
  //      per evitare falsi positivi con codici brevi che hanno spazi)
  if (/\s/.test(t) && !t.includes("\n")) {
    const tokens = t.split(/\s+/).map(cleanSerial).filter((s): s is string => s !== null);
    if (tokens.length >= 5) {
      // Verifica lunghezza uniforme (>= 90% same length)
      const lengths = tokens.map((s) => s.length);
      const modeLen = lengths.sort((a, b) => a - b)[Math.floor(lengths.length / 2)];
      const matching = tokens.filter((s) => Math.abs(s.length - modeLen) <= 1).length;
      if (matching / tokens.length >= 0.9) {
        return { serials: dedupeAndCap(tokens), format: "space" };
      }
    }
  }

  return null;
}

/**
 * Main entry point: prova tutti i parser in ordine di specificità.
 * Ritorna MultiSerialResult se trova 2+ seriali, altrimenti null.
 */
export function tryParseMultiSerial(raw: string): MultiSerialResult | null {
  if (!raw || raw.length < 8) return null;

  // Ordine: JSON > GS1 multi > split. JSON è il più specifico.
  return (
    tryParseJson(raw) ??
    tryParseGs1Multi(raw) ??
    trySplitParser(raw)
  );
}
