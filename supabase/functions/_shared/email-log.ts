/**
 * Shared helper to log email delivery attempts to `email_delivery_log`.
 * Call after sending (or attempting to send) an email.
 *
 * NOTE: historical bug fixed — helper previously inserted `to_email` which
 * does not exist in the schema (column is `recipient`). Helper now writes
 * to the canonical column and accepts all Sprint-1C fields:
 *   stream, campaign_id, provider_id, cost_eur, charged_eur, metadata.
 */
export async function logEmailDelivery(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  params: {
    company_id?: string | null;
    /** Recipient email address. Preferred name. */
    recipient?: string;
    /** Back-compat alias for `recipient` — do not remove. */
    to_email?: string;
    subject: string;
    /** Semantic template identifier (e.g. "invoice_send"). Stored in `template_type`. */
    template_name?: string;
    /** Raw DB column if caller wants to set template_type directly. */
    template_type?: string;
    status: "sent" | "failed" | "queued" | "delivered" | "bounced";
    provider?: string;
    stream?: "marketing" | "transactional";
    campaign_id?: string | null;
    provider_id?: string | null;
    error_message?: string;
    cost_eur?: number;
    charged_eur?: number;
    metadata?: Record<string, unknown> | null;
  }
): Promise<{ id?: string }> {
  try {
    const recipient = params.recipient ?? params.to_email ?? "";
    const { data } = await supabaseAdmin
      .from("email_delivery_log")
      .insert({
        company_id:    params.company_id ?? null,
        recipient,
        subject:       params.subject,
        template_type: params.template_type ?? params.template_name ?? null,
        provider:      params.provider ?? "internal",
        status:        params.status,
        provider_id:   params.provider_id ?? null,
        error_message: params.error_message ?? null,
        stream:        params.stream ?? null,
        campaign_id:   params.campaign_id ?? null,
        cost_eur:      params.cost_eur ?? 0,
        charged_eur:   params.charged_eur ?? 0,
        metadata:      params.metadata ?? null,
      })
      .select("id")
      .single();
    return { id: (data as { id?: string } | null)?.id };
  } catch {
    // Non-blocking — don't let logging failures break email operations
    return {};
  }
}
