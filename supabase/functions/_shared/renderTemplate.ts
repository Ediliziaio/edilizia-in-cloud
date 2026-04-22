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

/** Mappa template-name → renderer. Aggiungere qui nuovi template. */
const TEMPLATE_REGISTRY = {
  welcome: welcome.render,
  invoice_sent: invoiceSent.render,
  ddt_sent: ddtSent.render,
  quote_sent: quoteSent.render,
  password_reset: passwordReset.render,
  invoice_due_soon: invoiceDueSoon.render,
  user_invited: userInvited.render,
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
];

/**
 * Carica il branding dinamico per una company da company_email_preferences
 * + companies.name (fallback se preferences assenti).
 */
export async function loadBranding(
  companyId: string | null,
  adminClient: SupabaseClient,
  overrides?: { unsubscribeUrl?: string | null },
): Promise<Branding> {
  // Default branding EiC
  const defaultBranding: Branding = {
    companyName: "EdiliziaInCloud",
    logoUrl: null,
    primaryColor: "#1E3A5F",
    secondaryColor: "#F97316",
    footerText: null,
    showPoweredBy: true,
    unsubscribeFooterHtml: null,
    replyTo: "support@ediliziaincloud.it",
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
    companyName: (prefs?.sender_name as string | undefined) || company?.name || "EdiliziaInCloud",
    logoUrl: (prefs?.logo_url as string | undefined) ?? null,
    primaryColor: (prefs?.primary_color as string | undefined) || "#1E3A5F",
    secondaryColor: (prefs?.secondary_color as string | undefined) || "#F97316",
    footerText: (prefs?.footer_text as string | undefined) ?? null,
    showPoweredBy: prefs?.footer_show_powered_by !== false,
    unsubscribeFooterHtml: (prefs?.unsubscribe_footer_html as string | undefined) ?? null,
    replyTo: (prefs?.reply_to_email as string | undefined) || "support@ediliziaincloud.it",
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
export async function renderEmailTemplate<K extends TemplateName>(params: {
  templateName: K;
  companyId: string | null;
  props: Parameters<typeof TEMPLATE_REGISTRY[K]>[0];
  adminClient?: SupabaseClient;
  brandingOverride?: Partial<Branding>;
  unsubscribeUrl?: string | null;
}): Promise<RenderedTemplate> {
  const admin = params.adminClient ?? createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const rendererFn = TEMPLATE_REGISTRY[params.templateName] as unknown as (
    props: unknown,
    branding: Branding,
  ) => RenderedTemplate;
  if (!rendererFn) {
    throw new Error(
      `Unknown template "${params.templateName}". Available: ${AVAILABLE_TEMPLATES.join(", ")}`,
    );
  }

  const baseBranding = await loadBranding(params.companyId, admin, {
    unsubscribeUrl: params.unsubscribeUrl,
  });

  const branding: Branding = {
    ...baseBranding,
    ...params.brandingOverride,
  };

  return rendererFn(params.props, branding);
}
