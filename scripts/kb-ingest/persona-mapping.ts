/**
 * Mappa: ogni .docx → quali personas di Silvio devono accedere ai suoi chunk.
 *
 * Regola Decisione 1 (Opzione A): solo agenti super_admin leggono il KB.
 * Le `persona_keys` qui sono per scoping interno tra le 21 personas di Silvio.
 * Le 21 personas vivono in `silvio_admin_personas` (vedi migration
 * `20260509040000_silvio_21_personas.sql`).
 *
 * Volumi → "fondamenta" universali: persona_keys = [] (tutti).
 * Manuali tematici → personas specifiche.
 * Fogli verifica → kb_priority='verifica' (chunk type a parte).
 */

export type DocxMapping = {
  filename: string;       // nome file in /Users/agenteai/Downloads/libri me manuali/
  slug: string;           // kb_source_book — slug stabile
  kb_section: string;     // sezione macro (mappata alle 21 aree esistenti)
  kb_priority: "detail" | "verifica" | "esercizio";
  persona_keys: string[]; // [] = tutti gli agenti super_admin
};

export const DOCX_MAPPING: DocxMapping[] = [
  // ─── Volumi fondamenta (universali — tutte le personas) ─────────────────
  {
    filename: "Volume 1 - Imprenditore Edile 3.0.docx",
    slug: "volume-1",
    kb_section: "22-metodo-fondamenta",
    kb_priority: "detail",
    persona_keys: [], // tutti
  },
  {
    filename: "Volume 2 - Imprenditore Edile 3.0.docx",
    slug: "volume-2",
    kb_section: "22-metodo-fondamenta",
    kb_priority: "detail",
    persona_keys: [],
  },
  {
    filename: "Volume 3 - Imprenditore Edile 3.0_fixed.docx", // usa il _fixed se esiste
    slug: "volume-3",
    kb_section: "22-metodo-fondamenta",
    kb_priority: "detail",
    persona_keys: [],
  },
  {
    filename: "Guida Benvenuto al Corso — Imprenditore Edile 3.0.docx",
    slug: "guida-benvenuto",
    kb_section: "22-metodo-fondamenta",
    kb_priority: "detail",
    persona_keys: [],
  },

  // ─── Manuali tematici → personas specifiche ─────────────────────────────
  {
    filename: "Manuale Management Impresa Edile — Imprenditore Edile 3.0.docx",
    slug: "manuale-management",
    kb_section: "22-metodo-management",
    kb_priority: "detail",
    // Antonio (edilizia), Vittorio (strategic frameworks), Beatrice (CFO), Federico (CEO)
    persona_keys: ["antonio", "vittorio", "beatrice", "federico"],
  },
  {
    filename: "Manuale Delega Efficace — Imprenditore Edile 3.0.docx",
    slug: "manuale-delega",
    kb_section: "22-metodo-delega",
    kb_priority: "detail",
    // Laura (HR), Vittorio (strategic), Antonio (edilizia)
    persona_keys: ["laura", "vittorio", "antonio"],
  },
  {
    filename: "Manuale Mansionari e Procedure — Imprenditore Edile 3.0.docx",
    slug: "manuale-mansionari",
    kb_section: "22-metodo-mansionari",
    kb_priority: "detail",
    // Laura, Antonio, Chiara (PM)
    persona_keys: ["laura", "antonio", "chiara"],
  },
  {
    filename: "Gestione Finanziaria — Imprenditore Edile 3.0.docx",
    slug: "gestione-finanziaria",
    kb_section: "22-metodo-finanza",
    kb_priority: "detail",
    // Beatrice (CFO), Roberta (amm.), Federico (CEO)
    persona_keys: ["beatrice", "roberta", "federico"],
  },
  {
    filename: "Reclutamento e Selezione — Imprenditore Edile 3.0.docx",
    slug: "reclutamento-selezione",
    kb_section: "22-metodo-hr",
    kb_priority: "detail",
    persona_keys: ["laura", "antonio"],
  },
  {
    filename: "Direttore Vendita — Imprenditore Edile 3.0.docx",
    slug: "direttore-vendita",
    kb_section: "22-metodo-vendita",
    kb_priority: "detail",
    // Marco (sales), Sofia (marketing), Tommaso (outbound)
    persona_keys: ["marco", "sofia", "tommaso"],
  },
  {
    filename: "Collaboratori Vincenti — Imprenditore Edile 3.0.docx",
    slug: "collaboratori-vincenti",
    kb_section: "22-metodo-hr",
    kb_priority: "detail",
    persona_keys: ["laura", "antonio", "vittorio"],
  },
  {
    filename: "Resistenza al Cambiamento — Imprenditore Edile 3.0.docx",
    slug: "resistenza-cambiamento",
    kb_section: "22-metodo-mindset",
    kb_priority: "detail",
    // universale — è mindset imprenditore
    persona_keys: [],
  },
  {
    filename: "Schede Operative — Imprenditore Edile 3.0.docx",
    slug: "schede-operative",
    kb_section: "22-metodo-operativo",
    kb_priority: "detail",
    persona_keys: ["antonio", "chiara", "laura"],
  },
  {
    filename: "Quaderno degli Esercizi — Imprenditore Edile 3.0.docx",
    slug: "quaderno-esercizi",
    kb_section: "22-metodo-esercizi",
    kb_priority: "esercizio",
    persona_keys: [],
  },

  // ─── Fogli di verifica → kb_priority='verifica' ─────────────────────────
  {
    filename: "Foglio di Verifica — Imprenditore Edile 3.0.docx",
    slug: "fv-generale",
    kb_section: "22-metodo-verifica",
    kb_priority: "verifica",
    persona_keys: [],
  },
  {
    filename: "Foglio Verifica Management Impresa Edile — Imprenditore Edile 3.0.docx",
    slug: "fv-management",
    kb_section: "22-metodo-verifica",
    kb_priority: "verifica",
    persona_keys: ["antonio", "vittorio", "federico"],
  },
  {
    filename: "Foglio Verifica Delega Efficace — Imprenditore Edile 3.0.docx",
    slug: "fv-delega",
    kb_section: "22-metodo-verifica",
    kb_priority: "verifica",
    persona_keys: ["laura", "vittorio"],
  },
  {
    filename: "FV Delega Efficace — Imprenditore Edile 3.0.docx",
    slug: "fv-delega-2",
    kb_section: "22-metodo-verifica",
    kb_priority: "verifica",
    persona_keys: ["laura", "vittorio"],
  },
  {
    filename: "Foglio Verifica Responsabile Cantiere — Imprenditore Edile 3.0.docx",
    slug: "fv-resp-cantiere",
    kb_section: "22-metodo-verifica",
    kb_priority: "verifica",
    persona_keys: ["antonio", "chiara"],
  },
  {
    filename: "FV Capo Cantiere — Imprenditore Edile 3.0.docx",
    slug: "fv-capo-cantiere",
    kb_section: "22-metodo-verifica",
    kb_priority: "verifica",
    persona_keys: ["antonio", "chiara"],
  },
  {
    filename: "Lista Verifica Collaboratore Vincente — Imprenditore Edile 3.0.docx",
    slug: "fv-collaboratore",
    kb_section: "22-metodo-verifica",
    kb_priority: "verifica",
    persona_keys: ["laura", "antonio"],
  },
];

/**
 * Path assoluto della cartella .docx (Florin lo droppa qua o riceve override
 * via env var KB_INGEST_SOURCE_DIR).
 */
export const SOURCE_DIR =
  process.env.KB_INGEST_SOURCE_DIR ??
  "/Users/agenteai/Downloads/libri me manuali";

/**
 * Cache directory per i .md intermedi (gitignored).
 */
export const CACHE_DIR = "./scripts/kb-ingest/.cache";
