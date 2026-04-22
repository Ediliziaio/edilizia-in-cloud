// ============================================================================
// applyPlaceholders — substitution `{{var}}` per i template DB
// ============================================================================
// Pure-TS (zero dipendenze) per poter essere:
//   - importato dalle Edge Functions Deno (resolveTemplate)
//   - unit-testato via vitest da `src/test/logic/emailTemplatePlaceholders.test.ts`
//
// Formato: `{{variable}}` con whitespace interno tollerato (`{{ variable }}`).
// I placeholder non matchati restano in chiaro nel template (scelta
// conservativa: l'utente vede subito il mismatch invece di ricevere testo vuoto).
// ============================================================================

/** Pattern globale `{{ nome }}` / `{{ contact.first_name }}` con whitespace interno opzionale. */
const PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)\s*\}\}/g;

/**
 * Escape HTML per evitare injection quando i placeholder vengono iniettati
 * dentro attributi/tag. Identico a escapeHtml() in types.ts ma ripetuto qui
 * per evitare import circolari (types.ts è condiviso ma pesa di più).
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function splitFullName(value: unknown): { first?: string; last?: string; full?: string } {
  if (typeof value !== "string") return {};
  const full = value.trim();
  if (!full) return {};
  const parts = full.split(/\s+/);
  return {
    first: parts[0],
    last: parts.length > 1 ? parts.slice(1).join(" ") : undefined,
    full,
  };
}

function coalesce(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== "");
}

function resolveAccessRecipientAlias(data: Record<string, unknown>, key: string): unknown {
  const recipientName = splitFullName(
    coalesce(data.recipientName, data.userName, data.fullName, data.name),
  );

  const aliases: Record<string, unknown> = {
    "user.first_name": coalesce(data.userFirstName, data.firstName, data.recipientFirstName, recipientName.first),
    "user.last_name": coalesce(data.userLastName, data.lastName, data.recipientLastName, recipientName.last),
    "user.full_name": coalesce(data.userFullName, data.fullName, data.recipientName, recipientName.full),
    "user.name": coalesce(data.userFullName, data.fullName, data.recipientName, recipientName.full),
    "user.email": coalesce(data.userEmail, data.recipientEmail, data.email),
    "user.role": coalesce(data.userRole, data.role, data.roleLabel),
    "user.role_label": coalesce(data.userRoleLabel, data.roleLabel, data.userRole, data.role),
    "user.login_url": coalesce(data.userLoginUrl, data.loginUrl, data.acceptUrl, data.verifyUrl),
    "user.invite_url": coalesce(data.userInviteUrl, data.inviteUrl, data.acceptUrl),

    "recipient.first_name": coalesce(data.recipientFirstName, data.firstName, data.userFirstName, recipientName.first),
    "recipient.last_name": coalesce(data.recipientLastName, data.lastName, data.userLastName, recipientName.last),
    "recipient.full_name": coalesce(data.recipientName, data.userFullName, data.fullName, recipientName.full),
    "recipient.name": coalesce(data.recipientName, data.userFullName, data.fullName, recipientName.full),
    "recipient.email": coalesce(data.recipientEmail, data.userEmail, data.email),

    "contact.first_name": coalesce(data.contactFirstName, data.firstName, data.recipientFirstName, data.userFirstName, recipientName.first),
    "contact.last_name": coalesce(data.contactLastName, data.lastName, data.recipientLastName, data.userLastName, recipientName.last),
    "contact.full_name": coalesce(data.contactFullName, data.recipientName, data.userFullName, data.fullName, recipientName.full),
    "contact.email": coalesce(data.contactEmail, data.recipientEmail, data.userEmail, data.email),

    "company.name": coalesce(data.companyName, data.company_name),
  };

  return aliases[key];
}

function resolvePlaceholderValue(data: Record<string, unknown>, key: string): unknown {
  if (Object.prototype.hasOwnProperty.call(data, key)) return data[key];
  if (!key.includes(".")) return data[key];

  let cursor: unknown = data;
  for (const part of key.split(".")) {
    if (!cursor || typeof cursor !== "object") return resolveAccessRecipientAlias(data, key);
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor ?? resolveAccessRecipientAlias(data, key);
}

/**
 * Sostituisce `{{nome}}` con il valore corrispondente.
 *
 * @param template Stringa con placeholder.
 * @param data Mappa chiave→valore. I valori vengono coerciti a stringa.
 * @param escape Se true (default per html_body) applica escapeHtml al valore
 *               prima di iniettarlo. Per subject/text_body passare false.
 */
export function applyPlaceholders(
  template: string,
  data: Record<string, unknown>,
  escape: boolean,
): string {
  return template.replace(PLACEHOLDER_PATTERN, (match, key: string) => {
    const raw = resolvePlaceholderValue(data, key);
    if (raw === undefined || raw === null) {
      // Placeholder non matchato → lascia il token in chiaro così il bug
      // è immediatamente visibile nell'email (e nel preview).
      return match;
    }
    const asString = String(raw);
    return escape ? escapeHtml(asString) : asString;
  });
}

/**
 * Estrae l'elenco dei nomi di placeholder trovati in una stringa template.
 * Usato dalla UI per validare in tempo reale ciò che il super_admin scrive.
 */
export function extractPlaceholderKeys(template: string): string[] {
  const seen = new Set<string>();
  const re = new RegExp(PLACEHOLDER_PATTERN.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(template)) !== null) {
    seen.add(match[1]);
  }
  return Array.from(seen);
}

/**
 * Deriva una versione plain text da HTML strippando tag + decodificando
 * entity base. Usata dal resolver quando text_body è NULL.
 * Output "decent enough", non RFC-perfect.
 */
export function htmlToPlainText(html: string): string {
  return html
    // converti <br> e </p> in newline
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    // strippa tutti i tag
    .replace(/<[^>]+>/g, "")
    // decodifica entity comuni
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // collapse whitespace + trim linee
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
