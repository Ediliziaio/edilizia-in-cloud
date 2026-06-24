// deno-lint-ignore-file no-explicit-any
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPlatformSetting } from "./getPlatformSetting.ts";

export type EmailStream = "marketing" | "transactional";

export interface ResolvedSender {
  /** Effective `from` header: `"Nome <email>"` or just `email`. */
  from: string;
  fromEmail: string;
  fromName?: string;
  replyTo: string;
  /** True se l'invio parte da un dominio custom dell'azienda verificato. */
  usingCustomDomain: boolean;
  /** FK verso company_email_domains.id quando usingCustomDomain=true. */
  customDomainId?: string;
  /** Hostname del dominio mittente (custom o fallback EiC). */
  domain: string;
  /** Provider da usare per questa stream (da platform_settings). */
  provider: string;
  /** Descrive come è stato scelto il sender (debug/audit). */
  source:
    | "custom_domain_verified"
    | "fallback_subdomain"
    | "platform_default";
}

/**
 * Risolve mittente effettivo per una data azienda + stream.
 *
 * Logica (per ordine di preferenza):
 *   1. Se esiste company_email_preferences.{stream}_domain_id puntato a
 *      company_email_domains verificato+attivo → usa il dominio custom.
 *      Output: `"<sender_name> <sender_prefix@dominio_custom>"`, reply_to = preferences.reply_to_email
 *   2. Altrimenti usa il sottodominio fallback EiC (platform_settings):
 *        transactional → notifiche.ediliziaincloud.it
 *        marketing     → mail.ediliziaincloud.it
 *      Output: `"<sender_name> via EdiliziaInCloud <sender_prefix@fallback>"`,
 *              reply_to = preferences.reply_to_email (cliente vede risposte)
 *   3. Se company_email_preferences assente (edge case): platform_default
 *      da `email_{stream}_from_address` + `email_{stream}_from_name`.
 */
export async function resolveSender(
  companyId: string | null,
  stream: EmailStream,
  adminClient?: SupabaseClient,
): Promise<ResolvedSender> {
  const admin = adminClient ?? createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── 1. Provider corrente + fallback subdomain from platform_settings ─────
  const provider = (await getPlatformSetting(`email_${stream}_provider`)) || "resend";
  const fallbackSubdomain =
    (await getPlatformSetting(`email_${stream}_fallback_subdomain`)) ||
    (stream === "transactional"
      ? "notifiche.ediliziaincloud.it"
      : "mail.ediliziaincloud.it");
  const fallbackFromName =
    (await getPlatformSetting(`email_${stream}_fallback_from_name`)) ||
    "EdiliziaInCloud";
  const fallbackFromSuffix =
    (await getPlatformSetting(`email_${stream}_fallback_from_suffix`)) ||
    " via EdiliziaInCloud";

  // ── 2. Platform-level email (companyId null) → platform default ──────────
  if (!companyId) {
    const platformEmail =
      (await getPlatformSetting(`email_${stream}_from_address`)) ||
      `noreply@${fallbackSubdomain}`;
    const platformName =
      (await getPlatformSetting(`email_${stream}_from_name`)) ||
      fallbackFromName;
    return {
      from: `${platformName} <${platformEmail}>`,
      fromEmail: platformEmail,
      fromName: platformName,
      // Reply-To: il "From" resta il noreply, ma le risposte vanno a una casella
      // monitorata (platform_settings email_default_reply_to). Fallback: il from.
      replyTo: (await getPlatformSetting("email_default_reply_to")) || platformEmail,
      usingCustomDomain: false,
      domain: fallbackSubdomain,
      provider,
      source: "platform_default",
    };
  }

  // ── 3. Company preferences + (opzionale) dominio custom ──────────────────
  const { data: prefs } = await admin
    .from("company_email_preferences")
    .select(
      "sender_name, sender_prefix, reply_to_email, transactional_domain_id, marketing_domain_id",
    )
    .eq("company_id", companyId)
    .maybeSingle();

  const senderPrefix = (prefs?.sender_prefix as string | undefined) ?? "no-reply";
  const senderName = (prefs?.sender_name as string | undefined) ?? fallbackFromName;
  const replyTo =
    (prefs?.reply_to_email as string | undefined) ||
    (await getPlatformSetting("email_default_reply_to")) ||
    `no-reply@${fallbackSubdomain}`;

  const domainIdKey =
    stream === "transactional" ? "transactional_domain_id" : "marketing_domain_id";
  const domainId = prefs?.[domainIdKey] as string | undefined | null;

  // ── 4. Dominio custom attivo? ────────────────────────────────────────────
  if (domainId) {
    const { data: domainRow } = await admin
      .from("company_email_domains")
      .select(
        "id, domain, is_verified, is_active, from_name, resend_status, ee_spf_verified, ee_dkim_verified, sg_cname_1_valid, sg_cname_2_valid, sg_cname_3_valid",
      )
      .eq("id", domainId)
      .maybeSingle();

    // Stream-specific verification requirements:
    //   transactional → richiede (SendGrid CNAMEs OK) OPPURE Resend status=verified
    //   marketing     → richiede Elastic Email SPF+DKIM OK
    const transactionalOK =
      (domainRow?.sg_cname_1_valid &&
        domainRow?.sg_cname_2_valid &&
        domainRow?.sg_cname_3_valid) ||
      domainRow?.resend_status === "verified";
    const marketingOK =
      domainRow?.ee_spf_verified && domainRow?.ee_dkim_verified;

    const streamOK = stream === "transactional" ? transactionalOK : marketingOK;

    if (domainRow && domainRow.is_active && streamOK) {
      const customEmail = `${senderPrefix}@${domainRow.domain}`;
      const customName = (domainRow.from_name as string | undefined) || senderName;
      return {
        from: `${customName} <${customEmail}>`,
        fromEmail: customEmail,
        fromName: customName,
        replyTo,
        usingCustomDomain: true,
        customDomainId: domainRow.id as string,
        domain: domainRow.domain as string,
        provider,
        source: "custom_domain_verified",
      };
    }
  }

  // ── 5. Fallback subdomain EiC ────────────────────────────────────────────
  const fallbackEmail = `${senderPrefix}@${fallbackSubdomain}`;
  const fallbackName = `${senderName}${fallbackFromSuffix}`;
  return {
    from: `${fallbackName} <${fallbackEmail}>`,
    fromEmail: fallbackEmail,
    fromName: fallbackName,
    replyTo,
    usingCustomDomain: false,
    domain: fallbackSubdomain,
    provider,
    source: "fallback_subdomain",
  };
}
