/**
 * MP-EMAIL-AI-01 — Lookup deterministica sui header email.
 *
 * Implementa il punto (c) del classificatore L1:
 *   List-Unsubscribe / List-Id  → newsletter
 *   Precedence: bulk            → newsletter
 *   Auto-Submitted: auto-generated → notifica
 *   local-part noreply/no-reply/mailer-daemon → notifica
 *   domini facebookmail/linkedinmail/instagram → social
 */

import type { EmailCategoria } from "./types";

export interface HeaderRuleResult {
  categoria: EmailCategoria;
  matched_by: string;
}

/**
 * Domini noti di piattaforme social (sender envelope o from).
 * Match esatto di suffisso (`endsWith`).
 */
const SOCIAL_DOMAINS = [
  "facebookmail.com",
  "linkedinmail.com",
  "instagram.com",
  "instagrammail.com",
  "tiktok.com",
  "tiktokmail.com",
  "threads.net",
  "x.com",
  "twitter.com",
] as const;

/**
 * Local-part (parte sx della @) tipici di mittenti automatici.
 * Pattern regex sul prefisso, case-insensitive.
 *
 * NON includere `info`, `admin`, `service`, `webmaster` — sono caselle di
 * CONTATTO standard delle aziende italiane (es. info@fornitore.it è una
 * casella vera, non un noreply). Includere falserebbe migliaia di mittenti
 * legittimi come "notifica".
 */
const NOTIFICATION_LOCALPARTS_RE =
  /^(no-?reply|noreply|notification|notify|alerts?|alert-|mailer-daemon|postmaster|bounces?|do-?not-?reply|automated|abuse|delivery|return)@/i;

/**
 * Domini PEC (notifiche istituzionali) — vanno come pratica, non notifica.
 * Supporta multi-level subdomain (es. comune.milano.pec.it).
 */
const PEC_DOMAINS_RE = /(^|\.)(pec\.it|legalmail\.it|pec\.aruba\.it|pec\.poste\.it|postacert\.it|legalmail|messaggipec)$/i;

/**
 * Applica le regole basate sui header. Restituisce match o null.
 */
export function classifyByHeaders(
  fromEmail: string,
  fromDomain: string,
  headers?: Record<string, string | undefined> | null,
): HeaderRuleResult | null {
  // Domini PEC → pratica (priorità su notifica)
  // PEC_DOMAINS_RE testa contro il dominio (non l'email completa)
  if (fromDomain && PEC_DOMAINS_RE.test(fromDomain)) {
    return { categoria: "pratica", matched_by: "header:pec-domain" };
  }

  // Social domains (suffix match) — prima di local-part noreply
  // (perché facebookmail manda spesso da notification@facebookmail.com)
  if (fromDomain) {
    const dom = fromDomain.toLowerCase();
    for (const social of SOCIAL_DOMAINS) {
      if (dom === social || dom.endsWith("." + social) || dom.endsWith("@" + social)) {
        return { categoria: "social", matched_by: `header:social-domain:${social}` };
      }
    }
  }

  // Local-part noreply/notification/mailer-daemon → notifica
  if (NOTIFICATION_LOCALPARTS_RE.test(fromEmail)) {
    return { categoria: "notifica", matched_by: "header:noreply-localpart" };
  }

  // Header List-Unsubscribe o List-Id → newsletter
  // (questi sono i header RFC 2369/8058 che identificano mailing list)
  const h = normalizeHeaders(headers);
  if (h["list-unsubscribe"] || h["list-id"] || h["list-post"] || h["list-archive"]) {
    return { categoria: "newsletter", matched_by: "header:list-unsubscribe" };
  }

  // Header Precedence: bulk|list|junk → newsletter (RFC 2076 legacy)
  if (h["precedence"] && /^(bulk|list|junk)$/i.test(h["precedence"])) {
    return { categoria: "newsletter", matched_by: "header:precedence-bulk" };
  }

  // Header Auto-Submitted (RFC 3834) → notifica
  if (h["auto-submitted"] && /auto-generated|auto-replied|auto-notified/i.test(h["auto-submitted"])) {
    return { categoria: "notifica", matched_by: "header:auto-submitted" };
  }

  // Header X-Auto-Response-Suppress (Microsoft) → notifica
  if (h["x-auto-response-suppress"]) {
    return { categoria: "notifica", matched_by: "header:x-auto-response" };
  }

  return null;
}

/**
 * Normalizza chiavi header in lowercase per accesso uniforme.
 */
export function normalizeHeaders(
  headers?: Record<string, string | undefined> | null,
): Record<string, string> {
  if (!headers) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (v == null) continue;
    out[k.toLowerCase()] = String(v);
  }
  return out;
}

/**
 * Estrae dominio da indirizzo email. Empty string se mal formato.
 */
export function extractDomain(email: string): string {
  if (!email) return "";
  const idx = email.lastIndexOf("@");
  if (idx < 0) return "";
  return email.slice(idx + 1).toLowerCase().trim();
}

/**
 * Estrae local-part (prima della @).
 */
export function extractLocalPart(email: string): string {
  if (!email) return "";
  const idx = email.lastIndexOf("@");
  if (idx < 0) return email.toLowerCase().trim();
  return email.slice(0, idx).toLowerCase().trim();
}

/**
 * Normalizza indirizzo email: lowercase + trim. Toglie eventuali <> e display name.
 */
export function normalizeEmail(raw: string): string {
  if (!raw) return "";
  // Estrai indirizzo da "Nome Cognome <a@b.c>" se presente
  const match = raw.match(/<([^>]+)>/);
  const addr = (match ? match[1] : raw).toLowerCase().trim();
  return addr;
}
