import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Shared helper to log email delivery attempts to `email_delivery_log`.
 * Call after sending (or attempting to send) an email.
 */
export async function logEmailDelivery(
  supabaseAdmin: ReturnType<typeof createClient>,
  params: {
    company_id?: string | null;
    to_email: string;
    subject: string;
    template_name?: string;
    status: "sent" | "failed" | "queued";
    provider?: string;
    error_message?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await supabaseAdmin.from("email_delivery_log").insert({
      company_id: params.company_id ?? null,
      to_email: params.to_email,
      subject: params.subject,
      template_name: params.template_name ?? null,
      status: params.status,
      provider: params.provider ?? "internal",
      error_message: params.error_message ?? null,
      metadata: params.metadata ?? null,
    });
  } catch {
    // Non-blocking — don't let logging failures break email operations
  }
}
