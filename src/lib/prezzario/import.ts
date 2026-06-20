/**
 * Libreria Prezzari Regionali — parser puro dell'import (CSV/Excel → contratto JSON).
 *
 * Prende una matrice di stringhe (righe × colonne), riconosce le colonne
 * dall'intestazione (alias IT, accent/punteggiatura-insensitive) e produce
 * il contratto consumato dalla UI (che aggiunge `fonte`) e dalla edge function
 * di pubblicazione:
 *
 *   capitoli: Array<{ codice, titolo, livello, ordine, parentCodice }>
 *   voci:     Array<{ codice, descrizione, unita_misura, prezzo,
 *                     incidenza_manodopera_pct, incidenza_sicurezza_pct,
 *                     capitoloCodice, ordine, errors, warnings }>
 *
 * Il core è puro (nessuna dipendenza React/Supabase) così è verificabile in
 * vitest. I wrapper file (CSV/Excel) vivono nella UI come per
 * `src/lib/tariffe/prezziarioImport.ts`, da cui RIUSIAMO `parseItalianNumber`.
 *
 * Vedi docs/superpowers/specs/2026-06-20-prezzari-regionali-design.md
 */
import { parseItalianNumber } from "@/lib/tariffe/prezziarioImport";

// ─── Normalizzazione header (replica del puro di prezziarioImport.ts) ─────────
// `normHeader` non è esportato da prezziarioImport.ts: lo replichiamo qui per
// non modificare quel file. Stesso comportamento (accent/punteggiatura-insensitive).

/** Combining diacritical marks (U+0300–U+036F) — per togliere gli accenti post-NFD. */
const COMBINING_MARKS = /[̀-ͯ]/g;

/** Normalizza un'intestazione per il matching (accent/punteggiatura insensitive). */
export function normHeader(h: string): string {
  return String(h ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(COMBINING_MARKS, "") // togli accenti
    .replace(/\([^)]*\)/g, " ") // togli "(...)"
    .replace(/[€$£%]/g, " ")
    .replace(/[._/\\\-*]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Campi riconosciuti + alias ──────────────────────────────────────────────

export type PrezzarioField =
  | "codice"
  | "descrizione"
  | "unita_misura"
  | "prezzo"
  | "incidenza_manodopera"
  | "incidenza_sicurezza"
  | "capitolo";

/** Alias intestazione → campo. Le stringhe sono già in forma normalizzata. */
export const PREZZARIO_FIELD_ALIASES: Record<PrezzarioField, string[]> = {
  codice: ["codice", "cod", "codice voce", "cod voce", "codice articolo", "rif", "ref", "n art", "art"],
  descrizione: [
    "descrizione",
    "desc",
    "descrizione voce",
    "descrizione breve",
    "descrizione estesa",
    "voce",
    "articolo",
    "lavorazione",
    "denominazione",
    "oggetto",
  ],
  unita_misura: ["um", "u m", "unita", "unita misura", "unita di misura", "misura", "udm"],
  prezzo: [
    "prezzo",
    "prezzo unitario",
    "prezzo unit",
    "prezzo eur",
    "importo",
    "importo unitario",
    "costo",
    "costo unitario",
    "valore",
    "euro",
    "eur",
    "prezzo cad",
  ],
  incidenza_manodopera: [
    "incidenza manodopera",
    "incidenza mano d opera",
    "incidenza mo",
    "inc manodopera",
    "inc mo",
    "manodopera",
    "mano d opera",
    "mo",
    "percentuale manodopera",
    "perc manodopera",
    "quota manodopera",
  ],
  incidenza_sicurezza: [
    "incidenza sicurezza",
    "incidenza oneri sicurezza",
    "oneri sicurezza",
    "inc sicurezza",
    "sicurezza",
    "quota sicurezza",
    "percentuale sicurezza",
  ],
  capitolo: ["capitolo", "cap", "categoria", "famiglia", "gruppo", "sezione", "macrocategoria"],
};

/** Priorità in caso un header combaci con più campi. */
const FIELD_PRIORITY: PrezzarioField[] = [
  "codice",
  "capitolo",
  "unita_misura",
  "incidenza_manodopera",
  "incidenza_sicurezza",
  "prezzo",
  "descrizione",
];

/** Costruisce la mappa alias-normalizzato → campo (priorità alta vince). */
function buildAliasLookup(extra?: Partial<Record<PrezzarioField, string[]>>): Map<string, PrezzarioField> {
  const m = new Map<string, PrezzarioField>();
  // inserisci in ordine inverso di priorità così la priorità alta sovrascrive
  for (let i = FIELD_PRIORITY.length - 1; i >= 0; i--) {
    const field = FIELD_PRIORITY[i];
    for (const alias of PREZZARIO_FIELD_ALIASES[field]) m.set(normHeader(alias), field);
    const ex = extra?.[field];
    if (ex) for (const alias of ex) m.set(normHeader(alias), field);
  }
  return m;
}

// ─── Tipi del contratto di output ────────────────────────────────────────────

export interface ParsedCapitoloImport {
  codice: string | null;
  titolo: string;
  livello: number;
  ordine: number;
  parentCodice: string | null;
}

export interface ParsedVoceImport {
  codice: string | null;
  descrizione: string;
  unita_misura: string | null;
  prezzo: number;
  /** Incidenza manodopera 0..1 (frazione). */
  incidenza_manodopera_pct: number | null;
  /** Incidenza oneri sicurezza 0..1 (frazione). */
  incidenza_sicurezza_pct: number | null;
  capitoloCodice: string | null;
  ordine: number;
  errors: string[];
  warnings: string[];
}

export interface ParsePrezzarioResult {
  capitoli: ParsedCapitoloImport[];
  voci: ParsedVoceImport[];
  detectedColumns: Partial<Record<PrezzarioField, number>>;
  globalErrors: string[];
}

export interface ParsePrezzarioOptions {
  regione?: string;
  /** Override/aggiunta alias header (es. da un adapter regionale). */
  columnAliases?: Partial<Record<PrezzarioField, string[]>>;
}

// ─── Percentuali → frazione 0..1 ─────────────────────────────────────────────

/**
 * Converte una percentuale testuale ("35%", "0,35", "35") in frazione 0..1.
 *  - toglie il segno "%" (che `parseItalianNumber` non gestisce) prima del parse
 *  - usa `parseItalianNumber` per il parsing numerico (gestisce virgola IT, €, ecc.)
 *  - valore > 1 ⇒ diviso 100 (es. 35 → 0,35)
 *  - valore ≤ 1 ⇒ già una frazione (es. 0,35 → 0,35)
 * Ritorna null se non interpretabile o negativo. Una stringa senza cifre (es.
 * "n.d.") è null: `parseItalianNumber` la collasserebbe a 0, ma per una
 * percentuale "nessun dato" ≠ "0%".
 */
export function parsePercentToFraction(raw: string | number | null | undefined): number | null {
  if (typeof raw === "string" && !/\d/.test(raw)) return null;
  const cleaned = typeof raw === "string" ? raw.replace(/%/g, "").trim() : raw;
  const n = parseItalianNumber(cleaned);
  if (n === null || n < 0) return null;
  const frac = n > 1 ? n / 100 : n;
  // clamp difensivo: una incidenza non può superare il 100%
  return frac > 1 ? 1 : frac;
}

// ─── Derivazione capitolo dal prefisso del codice voce ───────────────────────

/**
 * Deriva il codice-capitolo dal prefisso del codice voce, best-effort (1-2 liv.).
 * Esempi:
 *   "01.A.005" → "01.A"   (drop dell'ultimo segmento)
 *   "01.A"     → "01"     (un solo livello sopra)
 *   "01"       → null     (è già un capitolo top-level)
 *   "01005"    → null     (nessun separatore: non deducibile)
 * Separatori riconosciuti: ".", "-", "/", " ".
 */
export function deriveCapitoloCodice(codiceVoce: string | null): string | null {
  if (!codiceVoce) return null;
  const parts = String(codiceVoce)
    .trim()
    .split(/[.\-/\s]+/)
    .filter(Boolean);
  if (parts.length <= 1) return null;
  return parts.slice(0, -1).join(".");
}

// ─── Core puro ───────────────────────────────────────────────────────────────

const at = (vals: string[], idx: number | undefined): string =>
  idx === undefined ? "" : String(vals[idx] ?? "").trim();

/**
 * Parser puro: matrice (riga 0 = intestazione) → contratto JSON.
 * Non lancia: gli errori riga-per-riga finiscono in `errors`/`warnings`, gli
 * errori globali (file vuoto, colonne mancanti) in `globalErrors`. Le righe
 * invalide (senza descrizione o prezzo>0) sono incluse comunque, così la UI
 * può mostrarle e farle correggere.
 */
export function parsePrezzarioRegionale(
  matrix: string[][],
  opts?: ParsePrezzarioOptions,
): ParsePrezzarioResult {
  const clean = (matrix ?? []).filter(
    (r) => Array.isArray(r) && r.some((c) => String(c ?? "").trim() !== ""),
  );
  if (clean.length === 0) {
    return { capitoli: [], voci: [], detectedColumns: {}, globalErrors: ["Il file è vuoto."] };
  }

  const lookup = buildAliasLookup(opts?.columnAliases);
  const headers = clean[0].map((h) => String(h ?? ""));
  const detected: Partial<Record<PrezzarioField, number>> = {};
  headers.forEach((h, idx) => {
    const field = lookup.get(normHeader(h));
    if (field && detected[field] === undefined) detected[field] = idx;
  });

  const globalErrors: string[] = [];
  if (detected.descrizione === undefined) {
    globalErrors.push(
      'Colonna descrizione non riconosciuta. Usa un\'intestazione tipo "Descrizione" o "Voce".',
    );
  }
  if (detected.prezzo === undefined) {
    globalErrors.push(
      'Colonna prezzo non riconosciuta. Usa un\'intestazione tipo "Prezzo" o "Prezzo unitario".',
    );
  }
  // Senza descrizione+prezzo non possiamo costruire voci affidabili → stop.
  if (detected.descrizione === undefined || detected.prezzo === undefined) {
    return { capitoli: [], voci: [], detectedColumns: detected, globalErrors };
  }

  const hasCapitoloCol = detected.capitolo !== undefined;

  // Capitoli accumulati (dedotti): codice → capitolo. Usiamo una Map per
  // de-duplicare e preservare l'ordine di prima apparizione.
  const capitoliMap = new Map<string, ParsedCapitoloImport>();
  // Per la modalità "colonna capitolo" mappiamo titolo→codice sintetico stabile.
  const capitoloTitoloToCodice = new Map<string, string>();
  let capitoloOrdine = 0;

  /** Registra (idempotente) un capitolo per codice, derivando anche i padri. */
  const ensureCapitoloByCodice = (codice: string, titolo?: string): void => {
    if (capitoliMap.has(codice)) {
      // arricchisci il titolo se prima era solo un placeholder = codice
      const existing = capitoliMap.get(codice)!;
      if (titolo && (existing.titolo === existing.codice || !existing.titolo)) {
        existing.titolo = titolo;
      }
      return;
    }
    const parentCodice = deriveCapitoloCodice(codice);
    if (parentCodice) ensureCapitoloByCodice(parentCodice);
    const livello = parentCodice ? (capitoliMap.get(parentCodice)?.livello ?? 0) + 1 : 0;
    capitoliMap.set(codice, {
      codice,
      titolo: titolo && titolo.trim() ? titolo.trim() : codice,
      livello,
      ordine: capitoloOrdine++,
      parentCodice,
    });
  };

  // Righe "header di capitolo": hanno codice + descrizione ma niente prezzo>0
  // (es. "01 | OPERE EDILI"). Il loro testo titola il capitolo omonimo dedotto.
  const codiceToHeaderTitle = new Map<string, string>();

  const voci: ParsedVoceImport[] = [];
  let voceOrdine = 0;

  for (let i = 1; i < clean.length; i++) {
    const vals = clean[i];
    const errors: string[] = [];
    const warnings: string[] = [];

    const codiceRaw = at(vals, detected.codice);
    const codice = codiceRaw || null;

    // descrizione (obbligatoria)
    const descrizione = at(vals, detected.descrizione);
    if (!descrizione) errors.push("Descrizione mancante.");

    // prezzo (obbligatorio, > 0)
    const prezzoRaw = at(vals, detected.prezzo);
    const prezzoParsed = parseItalianNumber(prezzoRaw);
    let prezzo = 0;
    if (prezzoParsed === null) {
      errors.push(`Prezzo non valido ("${prezzoRaw}").`);
    } else if (prezzoParsed <= 0) {
      errors.push(`Prezzo deve essere maggiore di zero ("${prezzoRaw}").`);
    } else {
      prezzo = prezzoParsed;
    }

    // unità di misura (opzionale)
    const unita_misura = at(vals, detected.unita_misura) || null;

    // incidenza manodopera (opzionale, % → frazione 0..1)
    let incidenza_manodopera_pct: number | null = null;
    const incMoRaw = at(vals, detected.incidenza_manodopera);
    if (incMoRaw) {
      const frac = parsePercentToFraction(incMoRaw);
      if (frac === null) warnings.push(`Incidenza manodopera non valida ("${incMoRaw}"), ignorata.`);
      else incidenza_manodopera_pct = frac;
    }

    // incidenza sicurezza (opzionale, % → frazione 0..1)
    let incidenza_sicurezza_pct: number | null = null;
    const incSicRaw = at(vals, detected.incidenza_sicurezza);
    if (incSicRaw) {
      const frac = parsePercentToFraction(incSicRaw);
      if (frac === null) warnings.push(`Incidenza sicurezza non valida ("${incSicRaw}"), ignorata.`);
      else incidenza_sicurezza_pct = frac;
    }

    // capitolo: colonna esplicita → titolo; altrimenti dedotto dal prefisso codice
    let capitoloCodice: string | null = null;
    if (hasCapitoloCol) {
      const capTitolo = at(vals, detected.capitolo);
      if (capTitolo) {
        let codiceCap = capitoloTitoloToCodice.get(capTitolo);
        if (!codiceCap) {
          codiceCap = `C${capitoloTitoloToCodice.size + 1}`;
          capitoloTitoloToCodice.set(capTitolo, codiceCap);
          capitoliMap.set(codiceCap, {
            codice: codiceCap,
            titolo: capTitolo,
            livello: 0,
            ordine: capitoloOrdine++,
            parentCodice: null,
          });
        }
        capitoloCodice = codiceCap;
      }
    } else {
      // Una riga senza prezzo valido ma con codice+descrizione è un header di
      // capitolo: memorizza il titolo per il codice omonimo.
      if (codice && descrizione && prezzo <= 0) {
        codiceToHeaderTitle.set(codice, descrizione);
      }
      capitoloCodice = deriveCapitoloCodice(codice);
      if (capitoloCodice) ensureCapitoloByCodice(capitoloCodice);
    }

    voci.push({
      codice,
      descrizione,
      unita_misura,
      prezzo,
      incidenza_manodopera_pct,
      incidenza_sicurezza_pct,
      capitoloCodice,
      ordine: voceOrdine++,
      errors,
      warnings,
    });
  }

  // Arricchisci i titoli dei capitoli dedotti con le righe-header omonime
  // (un capitolo col titolo ancora placeholder = codice prende il testo della
  // riga "01 | OPERE EDILI").
  for (const [codice, titolo] of codiceToHeaderTitle) {
    const cap = capitoliMap.get(codice);
    if (cap && cap.titolo === cap.codice) cap.titolo = titolo;
  }

  // Riassegna `ordine` ai capitoli in modo contiguo (0..n) preservando l'ordine
  // di prima apparizione (la Map mantiene l'insertion order).
  const capitoli = Array.from(capitoliMap.values());
  capitoli.sort((a, b) => a.ordine - b.ordine);
  capitoli.forEach((c, idx) => {
    c.ordine = idx;
  });

  return { capitoli, voci, detectedColumns: detected, globalErrors };
}

/** Statistiche aggregate per la UI di preview. */
export function summarizePrezzario(voci: ParsedVoceImport[]): {
  total: number;
  valid: number;
  withErrors: number;
  withWarnings: number;
} {
  let valid = 0;
  let withErrors = 0;
  let withWarnings = 0;
  for (const v of voci) {
    if (v.errors.length > 0) withErrors++;
    else valid++;
    if (v.warnings.length > 0) withWarnings++;
  }
  return { total: voci.length, valid, withErrors, withWarnings };
}
