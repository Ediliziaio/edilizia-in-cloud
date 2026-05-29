/**
 * MP-EMAIL-AI-01 — L1 Classifier deterministico.
 *
 * Sequenza dall'evento più certo (mittente noto) al più incerto (regex su body).
 * La PRIMA regola che scatta ferma la cascata, assegna categoria + confidenza = 1.0
 * + classificato_da = 'regola'. Se nessuna scatta, ritorna null → l'email passa a
 * L3 (Haiku batch).
 *
 * NESSUNA chiamata di rete in questo modulo eccetto via `ClassifierContext`
 * (passato dall'esterno). Test-friendly: passa un mock di ClassifierContext.
 *
 * Sequenza:
 *   a) lookupMittenteNoto           — cache appresa, costo zero
 *   b) matchCRM (email esatta + dominio) — JOIN su customers/suppliers/employees
 *   c) classifyByHeaders            — header List-Unsubscribe/Precedence/etc + domini social
 *   d) applyRegexRules              — subject + snippet (prime ~500 char body)
 *   → null se nessuna matcha
 */

import type {
  EmailInput,
  ClassificationResult,
  ClassifierContext,
} from "./types";
import { classifyByHeaders, extractDomain, normalizeEmail } from "./headers";
import { applyRegexRules } from "./regex-rules";
import { applyRules, type RuleEmailInput } from "./rules-engine";

const MAX_BODY_CHARS = 500;

/**
 * Esegue la cascata L1 su una singola email.
 *
 * @returns ClassificationResult se una regola scatta. null se nessuna scatta
 *          → l'email deve scendere a L3.
 */
export async function classificaDeterministica(
  emailRaw: EmailInput,
  ctx: ClassifierContext,
): Promise<ClassificationResult | null> {
  // Normalizza input
  const from = normalizeEmail(emailRaw.from_email || "");
  if (!from) return null;
  const dominio = emailRaw.fromDomain || extractDomain(from);

  // ─── 0) REGOLE UTENTE (MP-05) — massima precedenza, costo zero ───────────
  if (ctx.loadRegole) {
    const regole = await ctx.loadRegole();
    if (regole.length > 0) {
      const match = applyRules({ ...emailRaw, from_email: from, fromDomain: dominio } as RuleEmailInput, regole);
      if (match) return match.result;
    }
  }

  // ─── a) mittenti_noti — cache appresa ────────────────────────────────────
  const noto = await ctx.lookupMittenteNoto(from, dominio);
  if (noto) {
    return {
      categoria: noto.categoria,
      entita_tipo: noto.entita_tipo,
      entita_id: noto.entita_id,
      confidenza: 1.0,
      classificato_da: "regola",
      da_rivedere: false,
      matched_by: "cache:mittenti_noti",
    };
  }

  // ─── b) match CRM su email esatta + dominio ──────────────────────────────
  const crm = await ctx.matchCRM(from, dominio);
  if (crm) {
    return {
      categoria: crm.categoria,
      entita_tipo: crm.entita_tipo,
      entita_id: crm.entita_id,
      confidenza: 1.0,
      classificato_da: "regola",
      da_rivedere: false,
      matched_by: `crm:${crm.matched_field}`,
    };
  }

  // ─── c) header standard (RFC 2369/3834/8058 + domini social) ─────────────
  const hdr = classifyByHeaders(from, dominio, emailRaw.headers);
  if (hdr) {
    return {
      categoria: hdr.categoria,
      entita_tipo: null,
      entita_id: null,
      confidenza: 1.0,
      classificato_da: "regola",
      da_rivedere: false,
      matched_by: hdr.matched_by,
    };
  }

  // ─── d) regex su subject + snippet (prime ~500 char) ─────────────────────
  const text = (
    (emailRaw.subject || "") +
    " " +
    (emailRaw.snippet || "").slice(0, MAX_BODY_CHARS)
  )
    .toLowerCase()
    .trim();

  if (text) {
    const rule = applyRegexRules(text);
    if (rule) {
      return {
        categoria: rule.categoria,
        entita_tipo: null,
        entita_id: null,
        confidenza: 1.0,
        classificato_da: "regola",
        da_rivedere: false,
        matched_by: rule.matched_by,
      };
    }
  }

  // Nessuna regola → scende a L3
  return null;
}

/**
 * Helper: estrae il `snippet` da raw_text / raw_html (per il classifier).
 *
 * Strategia:
 *   1. Se raw_text presente → prendi prime MAX_BODY_CHARS char
 *   2. Altrimenti se raw_html → strip tag rapido (no DOM, lavora con regex)
 *   3. Replace whitespace multipli con singolo spazio
 */
export function extractSnippet(
  raw_text?: string | null,
  raw_html?: string | null,
): string {
  let body = (raw_text || "").trim();
  if (!body && raw_html) {
    // Strip tag HTML rapido (non sicuro per XSS, ma ci serve solo testo per regex)
    body = raw_html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&[a-z]{2,8};/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  return body.slice(0, MAX_BODY_CHARS);
}
