// deno-lint-ignore-file no-explicit-any
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type EmailStream = "marketing" | "transactional";

export interface EmailRecipientList {
  valid: string[];
  invalid: string[];
}

export interface SuppressionHit {
  email: string;
  reason: string;
  companyId: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CHUNK_SIZE = 400;

const GLOBAL_BLOCK_REASONS_TRANSACTIONAL = new Set([
  "hard_bounce",
  "spam_complaint",
  "manual",
  "invalid",
  "legal",
]);

const GLOBAL_BLOCK_REASONS_MARKETING = new Set([
  ...GLOBAL_BLOCK_REASONS_TRANSACTIONAL,
  "unsubscribe",
]);

const COMPANY_BLOCK_REASONS_TRANSACTIONAL = new Set([
  "hard_bounce",
  "spam_complaint",
  "manual",
  "invalid",
  "legal",
]);

const COMPANY_BLOCK_REASONS_MARKETING = new Set([
  ...COMPANY_BLOCK_REASONS_TRANSACTIONAL,
  "unsubscribe",
]);

export function normalizeEmailAddress(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function isValidEmailAddress(value: unknown): value is string {
  const normalized = normalizeEmailAddress(value);
  return EMAIL_RE.test(normalized);
}

export function normalizeRecipientList(input: string | string[]): EmailRecipientList {
  const raw = Array.isArray(input) ? input : [input];
  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const item of raw) {
    const normalized = normalizeEmailAddress(item);
    if (!normalized || !EMAIL_RE.test(normalized)) {
      invalid.push(String(item ?? ""));
      continue;
    }
    if (!seen.has(normalized)) {
      seen.add(normalized);
      valid.push(normalized);
    }
  }

  return { valid, invalid };
}

export function isSuppressionBlocking(
  reason: string | null | undefined,
  companyId: string | null | undefined,
  stream: EmailStream,
): boolean {
  const normalizedReason = String(reason ?? "");
  if (!normalizedReason) return false;

  if (companyId == null) {
    return stream === "marketing"
      ? GLOBAL_BLOCK_REASONS_MARKETING.has(normalizedReason)
      : GLOBAL_BLOCK_REASONS_TRANSACTIONAL.has(normalizedReason);
  }

  return stream === "marketing"
    ? COMPANY_BLOCK_REASONS_MARKETING.has(normalizedReason)
    : COMPANY_BLOCK_REASONS_TRANSACTIONAL.has(normalizedReason);
}

export async function getSuppressedEmailMap(
  supabaseAdmin: SupabaseClient,
  emails: string[],
  companyId: string | null,
  stream: EmailStream,
): Promise<Map<string, SuppressionHit>> {
  const normalizedEmails = [
    ...new Set(emails.map(normalizeEmailAddress).filter((email) => EMAIL_RE.test(email))),
  ];
  const hits = new Map<string, SuppressionHit>();
  if (normalizedEmails.length === 0) return hits;

  for (let i = 0; i < normalizedEmails.length; i += CHUNK_SIZE) {
    const chunk = normalizedEmails.slice(i, i + CHUNK_SIZE);
    let query = supabaseAdmin
      .from("email_suppressions")
      .select("email, email_normalized, reason, company_id")
      .in("email_normalized", chunk);

    query = companyId
      ? query.or(`company_id.is.null,company_id.eq.${companyId}`)
      : query.is("company_id", null);

    const { data, error } = await query;
    if (error) {
      console.error("[emailSuppression] lookup failed:", error.message);
      continue;
    }

    for (const row of (data ?? []) as Array<{
      email: string;
      email_normalized: string | null;
      reason: string | null;
      company_id: string | null;
    }>) {
      const email = normalizeEmailAddress(row.email_normalized ?? row.email);
      if (!email || hits.has(email)) continue;
      if (!isSuppressionBlocking(row.reason, row.company_id, stream)) continue;
      hits.set(email, {
        email,
        reason: row.reason ?? "suppressed",
        companyId: row.company_id ?? null,
      });
    }
  }

  return hits;
}
