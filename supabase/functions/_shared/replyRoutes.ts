// deno-lint-ignore-file no-explicit-any
import { getPlatformSetting } from "./getPlatformSetting.ts";

/**
 * Reply GHL-style: ogni contatto ha un indirizzo di risposta stabile
 * `r-<route_id>@<email_reply_domain>` (es. replies.eic-mail.com). Le email
 * verso i contatti (campagne, automazioni) escono con quel Reply-To: la
 * risposta arriva all'inbound di Elastic Email → edge `email-inbound-reply`
 * → `email_inbox` agganciata al contatto, in tempo reale e senza bisogno
 * di caselle collegate.
 *
 * Feature-gated: se il platform setting `email_reply_domain` è assente le
 * funzioni ritornano vuoto e i chiamanti tengono il Reply-To classico
 * (accendere SOLO dopo aver configurato MX + route inbound su Elastic Email,
 * altrimenti le risposte rimbalzano al mittente).
 */
export async function getReplyAddress(
  admin: any,
  companyId: string | null | undefined,
  contactId: string | null | undefined,
): Promise<string | null> {
  try {
    if (!companyId || !contactId) return null;
    const domain = (await getPlatformSetting("email_reply_domain")) || "";
    if (!domain) return null;
    const { data, error } = await admin
      .from("email_reply_routes")
      .upsert(
        { company_id: companyId, contact_id: contactId },
        { onConflict: "company_id,contact_id", ignoreDuplicates: false },
      )
      .select("id")
      .maybeSingle();
    if (!error && data?.id) return `r-${data.id}@${domain}`;
    // Upsert senza returning (race / riga esistente): fallback in lettura.
    const { data: existing } = await admin
      .from("email_reply_routes")
      .select("id")
      .eq("company_id", companyId)
      .eq("contact_id", contactId)
      .maybeSingle();
    return existing?.id ? `r-${existing.id}@${domain}` : null;
  } catch {
    // Best-effort: il reply routing non deve MAI bloccare un invio.
    return null;
  }
}

/**
 * Variante batch per le campagne: una sola upsert set-based per tutti i
 * destinatari, poi mappa contact_id → indirizzo di risposta.
 */
export async function getReplyAddressMap(
  admin: any,
  companyId: string,
  contactIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    if (!companyId || contactIds.length === 0) return map;
    const domain = (await getPlatformSetting("email_reply_domain")) || "";
    if (!domain) return map;
    const rows = [...new Set(contactIds.filter(Boolean))].map((contact_id) => ({
      company_id: companyId,
      contact_id,
    }));
    const { data } = await admin
      .from("email_reply_routes")
      .upsert(rows, { onConflict: "company_id,contact_id", ignoreDuplicates: false })
      .select("id, contact_id");
    for (const r of data ?? []) map.set(r.contact_id, `r-${r.id}@${domain}`);
  } catch {
    // Best-effort, come sopra.
  }
  return map;
}
