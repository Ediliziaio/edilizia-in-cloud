/**
 * Adapter regionali per l'import dei prezzari.
 *
 * Ogni prezzario regionale ha intestazioni leggermente diverse. Un `ColumnPreset`
 * fornisce alias header AGGIUNTIVI (specifici della regione) che si sommano agli
 * alias generici del parser (`PREZZARIO_FIELD_ALIASES`): così l'autodetect resta
 * il default e i preset migliorano solo il riconoscimento dove serve.
 *
 * Struttura pronta per crescere: aggiungere una regione = aggiungere una entry
 * in `REGION_ADAPTERS`. `pickAdapter(regione)` fa il lookup accent/case-insensitive
 * con fallback al preset generico (nessun alias extra).
 *
 * Vedi docs/superpowers/specs/2026-06-20-prezzari-regionali-design.md
 */
import type { PrezzarioField } from "./import";
import { normHeader } from "./import";

/** Preset di mapping header→campo per una regione (alias extra, oltre ai generici). */
export interface ColumnPreset {
  /** Etichetta umana (es. "Prezzario Regione Toscana"). */
  label: string;
  /** Alias header AGGIUNTIVI per campo (in aggiunta agli alias generici). */
  columnAliases: Partial<Record<PrezzarioField, string[]>>;
}

/** Preset generico: nessun alias extra, solo autodetect dei campi standard. */
export const GENERIC_PRESET: ColumnPreset = {
  label: "Autodetect (generico)",
  columnAliases: {},
};

/**
 * Preset per regione. Le chiavi sono il nome regione normalizzato (`normHeader`)
 * così il lookup è accent/case-insensitive ("Emilia-Romagna" → "emilia romagna").
 *
 * NB: 2 preset d'esempio + il generico. Gli alias extra qui sono ipotesi
 * ragionevoli sui titoli colonna tipici dei due prezzari; vanno affinati quando
 * si carica il file reale (cambiano solo i dati, non lo schema del parser).
 */
export const REGION_ADAPTERS: Record<string, ColumnPreset> = {
  // ── Toscana ──────────────────────────────────────────────────────────────
  [normHeader("Toscana")]: {
    label: "Prezzario Regione Toscana",
    columnAliases: {
      codice: ["codice toscana", "n d ordine", "numero d ordine"],
      descrizione: ["descrizione analitica", "descrizione lavorazione"],
      prezzo: ["prezzo unitario euro", "prezzo netto"],
      incidenza_manodopera: ["incidenza manodopera %", "percentuale manodopera %", "md %"],
      incidenza_sicurezza: ["incidenza sicurezza %", "oneri sicurezza %"],
      capitolo: ["capitolo di riferimento", "voce di elenco"],
    },
  },
  // ── Lombardia ────────────────────────────────────────────────────────────
  [normHeader("Lombardia")]: {
    label: "Prezzario Regione Lombardia (DEI/Opere edili)",
    columnAliases: {
      codice: ["codice voce dei", "n cam", "codice cam"],
      descrizione: ["descrizione estesa voce", "descrizione opera"],
      prezzo: ["prezzo applicazione", "prezzo unitario applicazione"],
      incidenza_manodopera: ["aliquota manodopera", "perc m o", "quota m o %"],
      incidenza_sicurezza: ["aliquota sicurezza", "perc sicurezza"],
      capitolo: ["macro categoria", "opera"],
    },
  },
};

/**
 * Restituisce il `ColumnPreset` per una regione, con fallback al generico.
 * Lookup accent/case-insensitive (riusa `normHeader`).
 */
export function pickAdapter(regione?: string | null): ColumnPreset {
  if (!regione) return GENERIC_PRESET;
  return REGION_ADAPTERS[normHeader(regione)] ?? GENERIC_PRESET;
}

/** Elenco regioni con un preset dedicato (per popolare una select nella UI). */
export function adapterRegions(): Array<{ key: string; label: string }> {
  return Object.entries(REGION_ADAPTERS).map(([key, preset]) => ({ key, label: preset.label }));
}
