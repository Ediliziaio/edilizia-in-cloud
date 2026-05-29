/**
 * MP-EMAIL-AI-05 — Motore di valutazione regole di instradamento.
 *
 * Logica PURA (nessun DB, nessuna rete): data un'email + una lista di regole,
 * trova la prima regola che matcha e traduce le sue azioni in ClassificationResult.
 *
 * Usato sia client (src/lib/email-ai/classifier.ts) sia edge (gemello Deno in
 * _shared/email-ai-cascade.ts). Mantieni i due in sync.
 *
 * Precedenza (MP-05 §4): le regole sono valutate per `priorita` crescente
 * (più basso = prima); a parità, la più specifica (più condizioni). La prima
 * che matcha vince e ferma la valutazione.
 */

import type { EmailCategoria, EntitaTipo, ClassificationResult, EmailInput } from "./types";

// ─── Tipi regola ──────────────────────────────────────────────────────────────

export type CampoCondizione =
  | "indirizzo"      // from_email completo
  | "dominio"        // dominio mittente
  | "destinatario"   // to/cc
  | "oggetto"        // subject
  | "corpo"          // snippet/body
  | "allegato"       // ha allegato / tipo
  | "casella";       // casella ricevente (to_email)

export type OperatoreCondizione =
  | "e"              // uguaglianza esatta (case-insensitive)
  | "contiene"
  | "termina_con"
  | "inizia_con"
  | "regex";

export interface Condizione {
  campo: CampoCondizione;
  operatore: OperatoreCondizione;
  valore: string;
}

export type TipoAzione =
  | "categoria"
  | "collega_entita"
  | "priorita"
  | "silenzia"
  | "marca_da_fare"
  | "notifica"
  | "etichetta"
  | "salta_ai";

export interface Azione {
  tipo: TipoAzione;
  valore?: unknown; // categoria string | {tipo, id} | priorità string | etichetta string | utente/reparto
}

export interface Regola {
  id: string;
  nome: string;
  origine: "manuale" | "auto";
  stato: "attiva" | "in_approvazione" | "disattivata" | "rifiutata";
  priorita: number;
  combinatore: "AND" | "OR";
  condizioni: Condizione[];
  azioni: Azione[];
}

/** Input esteso con i campi che le regole possono ispezionare. */
export interface RuleEmailInput extends EmailInput {
  to_email?: string | null;
  cc_emails?: string[] | null;
  has_attachment?: boolean;
  attachment_types?: string[];
}

export interface RuleMatchResult {
  result: ClassificationResult;
  regola_id: string;
  regola_nome: string;
  /** Azioni "secondarie" non legate alla classificazione (notifica, etichetta, silenzia, priorità). */
  side_effects: {
    priorita?: string;
    silenzia?: boolean;
    marca_da_fare?: boolean;
    notifica?: unknown;
    etichette?: string[];
    salta_ai?: boolean;
  };
}

// ─── Valutazione singola condizione ─────────────────────────────────────────

function fieldValue(email: RuleEmailInput, campo: CampoCondizione): string {
  switch (campo) {
    case "indirizzo": return (email.from_email || "").toLowerCase();
    case "dominio": return (email.fromDomain || "").toLowerCase();
    case "destinatario": {
      const to = (email.to_email || "").toLowerCase();
      const cc = (email.cc_emails || []).join(" ").toLowerCase();
      return `${to} ${cc}`.trim();
    }
    case "oggetto": return (email.subject || "").toLowerCase();
    case "corpo": return (email.snippet || "").toLowerCase();
    case "casella": return (email.to_email || "").toLowerCase();
    case "allegato": return email.has_attachment ? "si" : "no";
    default: return "";
  }
}

function matchCondizione(email: RuleEmailInput, cond: Condizione): boolean {
  const field = fieldValue(email, cond.campo);
  const val = (cond.valore || "").toLowerCase().trim();
  if (!val && cond.campo !== "allegato") return false;

  // allegato speciale: "si"/"no"/tipo
  if (cond.campo === "allegato") {
    if (val === "si" || val === "sì" || val === "yes") return email.has_attachment === true;
    if (val === "no") return email.has_attachment !== true;
    // tipo specifico (es. "pdf")
    return (email.attachment_types || []).some((t) => t.toLowerCase().includes(val));
  }

  switch (cond.operatore) {
    case "e": return field === val;
    case "contiene": return field.includes(val);
    case "termina_con": return field.endsWith(val);
    case "inizia_con": return field.startsWith(val);
    case "regex": {
      try { return new RegExp(cond.valore, "i").test(field); }
      catch { return false; }
    }
    default: return false;
  }
}

/** Valuta una regola intera (combinatore AND/OR). */
export function evaluateRule(email: RuleEmailInput, regola: Regola): boolean {
  if (!regola.condizioni || regola.condizioni.length === 0) return false;
  if (regola.combinatore === "OR") {
    return regola.condizioni.some((c) => matchCondizione(email, c));
  }
  // default AND
  return regola.condizioni.every((c) => matchCondizione(email, c));
}

/** Conta quante condizioni matchano (per ordinamento a parità di priorità). */
function countMatched(email: RuleEmailInput, regola: Regola): number {
  return regola.condizioni.filter((c) => matchCondizione(email, c)).length;
}

// ─── Traduzione azioni → ClassificationResult + side effects ────────────────

function azioniToResult(azioni: Azione[]): { result: ClassificationResult; side: RuleMatchResult["side_effects"] } {
  let categoria: EmailCategoria = "altro";
  let entita_tipo: EntitaTipo | null = null;
  let entita_id: string | null = null;
  const side: RuleMatchResult["side_effects"] = {};
  const etichette: string[] = [];

  for (const az of azioni) {
    switch (az.tipo) {
      case "categoria":
        if (typeof az.valore === "string") categoria = az.valore as EmailCategoria;
        break;
      case "collega_entita": {
        const v = az.valore as { tipo?: string; id?: string } | undefined;
        if (v && v.tipo) entita_tipo = v.tipo as EntitaTipo;
        if (v && v.id) entita_id = v.id;
        break;
      }
      case "priorita":
        if (typeof az.valore === "string") side.priorita = az.valore;
        break;
      case "silenzia": side.silenzia = true; break;
      case "marca_da_fare": side.marca_da_fare = true; break;
      case "notifica": side.notifica = az.valore; break;
      case "etichetta":
        if (typeof az.valore === "string") etichette.push(az.valore);
        break;
      case "salta_ai": side.salta_ai = true; break;
    }
  }
  if (etichette.length) side.etichette = etichette;

  const result: ClassificationResult = {
    categoria,
    entita_tipo,
    entita_id,
    confidenza: 1.0,
    classificato_da: "regola",
    da_rivedere: false,
    matched_by: "regola-utente",
  };
  return { result, side };
}

/**
 * Applica le regole in ordine di precedenza. Ritorna il primo match o null.
 *
 * @param rules — già filtrate per stato='attiva' e scope company. Vengono
 *   riordinate qui per (priorita asc, specificità desc).
 */
export function applyRules(email: RuleEmailInput, rules: Regola[]): RuleMatchResult | null {
  if (!rules || rules.length === 0) return null;

  // Ordine: priorità crescente, poi più specifica (più condizioni) prima
  const sorted = [...rules].sort((a, b) => {
    if (a.priorita !== b.priorita) return a.priorita - b.priorita;
    return (b.condizioni?.length || 0) - (a.condizioni?.length || 0);
  });

  for (const regola of sorted) {
    if (regola.stato !== "attiva") continue;
    if (evaluateRule(email, regola)) {
      const { result, side } = azioniToResult(regola.azioni);
      // Se la regola non assegna categoria ma solo side-effects, manteniamo "altro"
      // ma marchiamo comunque come matched (la cascata può proseguire? No: regola vince).
      return {
        result: { ...result, matched_by: `regola:${regola.nome}` },
        regola_id: regola.id,
        regola_nome: regola.nome,
        side_effects: side,
      };
    }
  }
  return null;
}
