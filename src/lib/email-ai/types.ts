/**
 * MP-EMAIL-AI-01 — Tipi condivisi cascata classificazione email.
 *
 * Usabili sia da client React che da Edge Function (Deno).
 * Non importare niente di runtime-specific qui.
 */

/** Tassonomia operativa MP §6 — 13 categorie. */
export type EmailCategoria =
  | "cliente"
  | "fornitore"
  | "operaio"
  | "preventivo"
  | "fattura"
  | "opportunita"
  | "supporto"
  | "pratica"
  | "newsletter"
  | "social"
  | "notifica"
  | "spam"
  | "altro";

/** Tipo entità CRM collegabile. */
export type EntitaTipo =
  | "cliente"
  | "fornitore"
  | "operaio"
  | "opportunita"
  | "ordine";

/** Sorgente della classificazione (popolata in classificato_da). */
export type ClassificatoDa = "regola" | "embedding" | "haiku" | "manuale";

/** Input minimo per il classificatore L1. */
export interface EmailInput {
  /** Indirizzo mittente normalizzato lowercase. */
  from_email: string;
  /** Dominio mittente (es. "gmail.com"). Calcolato auto se omesso. */
  fromDomain?: string;
  /** Nome mittente (opzionale, NON usato dai metodi L1). */
  from_name?: string | null;
  /** Subject (oggetto). */
  subject?: string | null;
  /** Body plain o snippet (prime ~500 char). */
  snippet?: string | null;
  /** Headers grezzi normalizzati lowercase chiave → valore. */
  headers?: Record<string, string | undefined> | null;
}

/** Output della cascata: tutto quello che serve per scrivere in email_inbox. */
export interface ClassificationResult {
  categoria: EmailCategoria;
  entita_tipo: EntitaTipo | null;
  entita_id: string | null;
  /** 0.00..1.00 — regola=1.0, haiku=output modello. */
  confidenza: number;
  classificato_da: ClassificatoDa;
  /** true se sotto soglia confidenza o ambigua. */
  da_rivedere: boolean;
  /** Quale regola/criterio ha scattato (debug + UI). */
  matched_by?: string;
}

/**
 * Contesto fornito al classificatore deterministico per le lookup CRM.
 * Implementato in modo diverso da client (supabase-js) vs edge (deno).
 */
export interface ClassifierContext {
  /** Cache mittenti noti per quel company_id. */
  lookupMittenteNoto: (
    email: string,
    dominio?: string,
  ) => Promise<MittenteNotoHit | null>;

  /** Lookup CRM per email mittente (cliente/fornitore/operaio). */
  matchCRM: (
    email: string,
    dominio: string,
  ) => Promise<CrmMatchHit | null>;

  /**
   * MP-EMAIL-AI-05 (opzionale): carica le regole utente attive per la company.
   * Se presente, vengono valutate PRIMA di tutto (massima precedenza).
   */
  loadRegole?: () => Promise<import("./rules-engine").Regola[]>;
}

export interface MittenteNotoHit {
  categoria: EmailCategoria;
  entita_tipo: EntitaTipo | null;
  entita_id: string | null;
}

export interface CrmMatchHit {
  categoria: EmailCategoria;
  entita_tipo: EntitaTipo;
  entita_id: string;
  matched_field: "email" | "domain";
}

/** Costante soglia confidenza Haiku: sotto = "altro" + da_rivedere=true. */
export const SOGLIA_CONFIDENZA_L3 = 0.6;

/** Etichette UI per le 13 categorie. */
export const CATEGORIA_LABELS: Record<EmailCategoria, string> = {
  cliente: "Cliente",
  fornitore: "Fornitore",
  operaio: "Operaio",
  preventivo: "Preventivo",
  fattura: "Fattura",
  opportunita: "Opportunità",
  supporto: "Supporto",
  pratica: "Pratica",
  newsletter: "Newsletter",
  social: "Social",
  notifica: "Notifica",
  spam: "Spam",
  altro: "Altro",
};

/** Icone Lucide per le categorie (string-name). */
export const CATEGORIA_ICONS: Record<EmailCategoria, string> = {
  cliente: "User",
  fornitore: "Truck",
  operaio: "HardHat",
  preventivo: "FileText",
  fattura: "Receipt",
  opportunita: "TrendingUp",
  supporto: "LifeBuoy",
  pratica: "Briefcase",
  newsletter: "Newspaper",
  social: "AtSign",
  notifica: "Bell",
  spam: "Ban",
  altro: "HelpCircle",
};

/** Colori tag Tailwind per le categorie. */
export const CATEGORIA_COLORS: Record<EmailCategoria, string> = {
  cliente: "bg-blue-100 text-blue-700 border-blue-200",
  fornitore: "bg-amber-100 text-amber-700 border-amber-200",
  operaio: "bg-orange-100 text-orange-700 border-orange-200",
  preventivo: "bg-violet-100 text-violet-700 border-violet-200",
  fattura: "bg-emerald-100 text-emerald-700 border-emerald-200",
  opportunita: "bg-pink-100 text-pink-700 border-pink-200",
  supporto: "bg-cyan-100 text-cyan-700 border-cyan-200",
  pratica: "bg-indigo-100 text-indigo-700 border-indigo-200",
  newsletter: "bg-slate-100 text-slate-700 border-slate-200",
  social: "bg-purple-100 text-purple-700 border-purple-200",
  notifica: "bg-gray-100 text-gray-600 border-gray-200",
  spam: "bg-red-100 text-red-700 border-red-200",
  altro: "bg-stone-100 text-stone-600 border-stone-200",
};
