// deno-lint-ignore-file no-explicit-any
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

import type { Branding, RenderedTemplate } from "./email-templates/types.ts";
import * as welcome from "./email-templates/welcome.ts";
import * as invoiceSent from "./email-templates/invoice-sent.ts";
import * as ddtSent from "./email-templates/ddt-sent.ts";
import * as quoteSent from "./email-templates/quote-sent.ts";
import * as passwordReset from "./email-templates/password-reset.ts";
import * as invoiceDueSoon from "./email-templates/invoice-due-soon.ts";
import * as userInvited from "./email-templates/user-invited.ts";
import * as accountVerify from "./email-templates/account-verify.ts";
import * as paymentReceived from "./email-templates/payment-received.ts";
import * as setupIncomplete from "./email-templates/setup-incomplete.ts";
import * as passwordChanged from "./email-templates/password-changed.ts";
import * as inviteReminder from "./email-templates/invite-reminder.ts";
import * as termsAccepted from "./email-templates/terms-accepted.ts";
import * as purchaseConfirmed from "./email-templates/purchase-confirmed.ts";
import { renderLayout } from "./email-templates/layout.ts";
import { resolveTemplate } from "./email-templates/resolveTemplate.ts";
import { applyPlaceholders, htmlToPlainText } from "./email-templates/applyPlaceholders.ts";
import { SYSTEM_EMAIL_CONTENT } from "./email-templates/system-email-content.generated.ts";

/** Mappa template-name → renderer. Aggiungere qui nuovi template. */
const TEMPLATE_REGISTRY = {
  welcome: welcome.render,
  invoice_sent: invoiceSent.render,
  ddt_sent: ddtSent.render,
  quote_sent: quoteSent.render,
  password_reset: passwordReset.render,
  invoice_due_soon: invoiceDueSoon.render,
  user_invited: userInvited.render,
  account_verify: accountVerify.render,
  payment_received: paymentReceived.render,
  setup_incomplete: setupIncomplete.render,
  password_changed: passwordChanged.render,
  invite_reminder: inviteReminder.render,
  terms_accepted: termsAccepted.render,
  purchase_confirmed: purchaseConfirmed.render,
} as const;

export type TemplateName = keyof typeof TEMPLATE_REGISTRY;

export const AVAILABLE_TEMPLATES: TemplateName[] = [
  "welcome",
  "invoice_sent",
  "ddt_sent",
  "quote_sent",
  "password_reset",
  "invoice_due_soon",
  "user_invited",
  "account_verify",
  "payment_received",
  "setup_incomplete",
  "password_changed",
  "invite_reminder",
  "terms_accepted",
  "purchase_confirmed",
];

/**
 * Legge i default di piattaforma (firma, footer, support mail) da
 * `platform_settings`. Mai throw: errore → defaults hardcoded EiC.
 * Il risultato è una mappa piatta key→value delle sole chiavi email_*
 * rilevanti per il branding.
 */
async function loadPlatformEmailDefaults(
  adminClient: SupabaseClient,
): Promise<Record<string, string>> {
  try {
    const { data, error } = await adminClient
      .from("platform_settings")
      .select("key, value")
      .in("key", [
        "email_default_from_name",
        "email_default_footer_text",
        "email_default_support_mail",
        "email_signature_text",
        "email_signature_html",
      ]);

    if (error || !data) return {};
    const map: Record<string, string> = {};
    for (const row of data as Array<{ key: string; value: string }>) {
      if (row.key && typeof row.value === "string") map[row.key] = row.value;
    }
    return map;
  } catch {
    return {};
  }
}

/**
 * Carica il branding dinamico per una company da company_email_preferences
 * + companies.name. Se company senza override → fallback a platform_settings
 * (firma/footer/support configurati dal SuperAdmin) → hardcoded EiC.
 */
export async function loadBranding(
  companyId: string | null,
  adminClient: SupabaseClient,
  overrides?: { unsubscribeUrl?: string | null },
): Promise<Branding> {
  // Carica i default platform-wide in parallelo: servono sempre come fallback
  const platformDefaults = await loadPlatformEmailDefaults(adminClient);

  const fallbackCompanyName = platformDefaults.email_default_from_name || "EdiliziaInCloud";
  const fallbackFooter = platformDefaults.email_default_footer_text || null;
  const fallbackSupport = platformDefaults.email_default_support_mail || "supporto@ediliziaincloud.com";

  // Default branding EiC (company senza id)
  const defaultBranding: Branding = {
    companyName: fallbackCompanyName,
    logoUrl: null,
    primaryColor: "#1E3A5F",
    secondaryColor: "#F97316",
    footerText: fallbackFooter,
    showPoweredBy: true,
    unsubscribeFooterHtml: null,
    replyTo: fallbackSupport,
    unsubscribeUrl: overrides?.unsubscribeUrl ?? null,
  };

  if (!companyId) return defaultBranding;

  // Carica preferences + company name in una query join
  const [prefsRes, companyRes] = await Promise.all([
    adminClient
      .from("company_email_preferences")
      .select(
        "logo_url, primary_color, secondary_color, footer_text, footer_show_powered_by, sender_name, reply_to_email, unsubscribe_footer_html",
      )
      .eq("company_id", companyId)
      .maybeSingle(),
    adminClient
      .from("companies")
      .select("name")
      .eq("id", companyId)
      .maybeSingle(),
  ]);

  const prefs = prefsRes.data as Record<string, any> | null;
  const company = companyRes.data as { name?: string } | null;

  return {
    companyName:
      (prefs?.sender_name as string | undefined) ||
      company?.name ||
      fallbackCompanyName,
    logoUrl: (prefs?.logo_url as string | undefined) ?? null,
    primaryColor: (prefs?.primary_color as string | undefined) || "#1E3A5F",
    secondaryColor: (prefs?.secondary_color as string | undefined) || "#F97316",
    footerText:
      (prefs?.footer_text as string | undefined) ?? fallbackFooter,
    showPoweredBy: prefs?.footer_show_powered_by !== false,
    unsubscribeFooterHtml:
      (prefs?.unsubscribe_footer_html as string | undefined) ?? null,
    replyTo:
      (prefs?.reply_to_email as string | undefined) || fallbackSupport,
    unsubscribeUrl: overrides?.unsubscribeUrl ?? null,
  };
}

/**
 * Entry point principale: renderizza un template per una company.
 *
 * @example
 * const out = await renderEmailTemplate({
 *   templateName: "invoice_sent",
 *   companyId: "uuid",
 *   props: { invoiceNumber: "2026/001", totalCents: 100000, ... },
 * });
 * // out.subject, out.html, out.text
 */
export async function renderEmailTemplate(params: {
  // string (non più solo TemplateName) perché ora rende anche le 58 chiavi di
  // SYSTEM_EMAIL_CONTENT (lifecycle, partner, otp_login, ...) oltre ai renderer code.
  templateName: string;
  companyId: string | null;
  props: Record<string, unknown>;
  adminClient?: SupabaseClient;
  brandingOverride?: Partial<Branding>;
  unsubscribeUrl?: string | null;
  /**
   * Variante per ruolo (es. "super_admin", "company_admin"). Se NULL o
   * non matchata nel DB si ricade sul default.
   */
  roleVariant?: string | null;
  /**
   * Email della PIATTAFORMA verso il cliente: il branding dev'essere quello di
   * EdiliziaInCloud, non del tenant. Senza, il template `welcome` saluta con
   * "Benvenuto in <nome dell'azienda del destinatario>!" — cioè lo accoglie
   * nella sua stessa azienda. `companyId` resta per log e override.
   */
  platformBranding?: boolean;
}): Promise<RenderedTemplate> {
  const admin = params.adminClient ?? createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const rendererFn = TEMPLATE_REGISTRY[params.templateName] as unknown as
    | ((props: unknown, branding: Branding) => RenderedTemplate)
    | undefined;
  // Contenuto di sistema (58 copy riscritti) per le chiavi senza renderer code.
  const systemContent = (SYSTEM_EMAIL_CONTENT as Record<
    string,
    { subject: string; html_body: string; text_body: string }
  >)[params.templateName as string];

  if (!rendererFn && !systemContent) {
    throw new Error(
      `Unknown template "${params.templateName}". Available: ${AVAILABLE_TEMPLATES.join(", ")}`,
    );
  }

  const baseBranding = await loadBranding(
    params.platformBranding ? null : params.companyId,
    admin,
    { unsubscribeUrl: params.unsubscribeUrl },
  );

  const branding: Branding = {
    ...baseBranding,
    ...params.brandingOverride,
  };

  // ── DB-first: override personalizzato dal super_admin nel builder ─────────
  // Ordine sorgente contenuto:
  //   1. override DB (platform_email_templates) — l'edit nel builder
  //   2. SYSTEM_EMAIL_CONTENT (copy riscritti) per le chiavi senza renderer code
  //   3. renderer code hardcoded (per i template documenti legacy)
  // 1 e 2 passano dal layout condiviso + substitution {{var}}.
  const override = await resolveTemplate(admin, params.templateName, params.roleVariant ?? null);
  const source = override ??
    (!rendererFn && systemContent
      ? { subject: systemContent.subject, html_body: systemContent.html_body, text_body: systemContent.text_body || null }
      : null);

  if (source) {
    const placeholderData: Record<string, unknown> = {
      // supportEmail dal branding come base: i props del caller possono sovrascriverlo.
      // Senza questo {{platform.support_email}} resta in chiaro (nessun caller lo passa).
      supportEmail: branding.replyTo,
      ...(params.props as unknown as Record<string, unknown>),
      companyName: branding.companyName,
    };

    // escape=false: html_body è HTML trusted generato dal builder.
    // Le URL nei {{placeholder}} NON devono essere HTML-escaped (& → &amp; rompe
    // i link con query string in molti client email).
    const innerBodyHtml = applyPlaceholders(source.html_body, placeholderData, false);
    const subject = applyPlaceholders(source.subject, placeholderData, false);
    const rawText = source.text_body
      ? applyPlaceholders(source.text_body, placeholderData, false)
      : htmlToPlainText(innerBodyHtml);

    const html = renderLayout({ branding, innerBodyHtml, preheaderText: subject });
    return { subject, html, text: rawText };
  }

  return rendererFn!(params.props, branding);
}
