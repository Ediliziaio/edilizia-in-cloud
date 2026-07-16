// ============================================================================
// systemEmail — invio best-effort delle email di sistema (template builder)
// ============================================================================
// Wrapper unico usato dai flussi evento (stripe-webhook, check-login-security,
// gdpr-compliance, accept-admin-invite, cron system-emails-tick) per inviare
// una delle 58 email di sistema con:
//   - render via renderEmailTemplate (branding company + override builder)
//   - dedup opzionale su lifecycle_email_sends (metadata->>dedupe_key)
//   - log dell'invio nella stessa tabella
// Non lancia MAI: un errore email non deve rompere il flusso chiamante.
// ============================================================================

// deno-lint-ignore-file no-explicit-any
import { renderEmailTemplate, type TemplateName } from "./renderTemplate.ts";
import { sendEmailUnified } from "./sendEmailUnified.ts";

export function formatEur(n: number): string {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}

export function formatDateIt(d: Date): string {
  return new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

export async function sendSystemEmail(admin: any, opts: {
  templateName: string;
  companyId: string | null;
  to: string;
  userId?: string | null;
  props: Record<string, unknown>;
  /** Se valorizzata, l'email NON viene reinviata se esiste già un send con la stessa chiave. */
  dedupeKey?: string;
}): Promise<boolean> {
  try {
    if (opts.dedupeKey) {
      const { data: dup } = await admin
        .from("lifecycle_email_sends")
        .select("id")
        .eq("template_key", opts.templateName)
        .eq("metadata->>dedupe_key", opts.dedupeKey)
        .limit(1)
        .maybeSingle();
      if (dup) return false;
    }

    const rendered = await renderEmailTemplate({
      templateName: opts.templateName as TemplateName,
      companyId: opts.companyId,
      adminClient: admin,
      props: opts.props as any,
    });

    const res = await sendEmailUnified({
      companyId: opts.companyId,
      stream: "transactional",
      to: [opts.to],
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      templateName: opts.templateName,
      skipCredits: true,
      adminClient: admin,
      metadata: { system_email: true, dedupe_key: opts.dedupeKey ?? null },
    });

    await admin.from("lifecycle_email_sends").insert({
      company_id: opts.companyId,
      user_id: opts.userId ?? null,
      template_key: opts.templateName,
      email_to: opts.to,
      delivery_status: res.ok ? "sent" : "failed",
      metadata: { dedupe_key: opts.dedupeKey ?? null },
    });

    return res.ok;
  } catch (e) {
    console.warn(`[systemEmail] invio ${opts.templateName} fallito:`, (e as Error)?.message);
    return false;
  }
}

/**
 * Primo profilo della company (di norma l'admin, pattern lifecycle-email-tick)
 * con email risolta via auth. null se non trovato.
 */
export async function getCompanyAdminContact(
  admin: any,
  companyId: string,
): Promise<{ email: string; firstName: string; userId: string } | null> {
  try {
    const { data: profile } = await admin
      .from("profiles")
      .select("id, first_name")
      .eq("company_id", companyId)
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!profile) return null;
    const { data: ud } = await admin.auth.admin.getUserById(profile.id);
    const email = ud?.user?.email;
    if (!email) return null;
    return { email, firstName: profile.first_name || "", userId: profile.id };
  } catch {
    return null;
  }
}
