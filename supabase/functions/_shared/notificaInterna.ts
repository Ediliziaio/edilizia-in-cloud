// ============================================================================
// notificaInterna — avvisi operativi a NOI, non al cliente
// ============================================================================
// Serve per i fatti che il titolare vuole sapere appena succedono: un nuovo
// cliente che paga, un incasso ricevuto. Volutamente NON passa dal builder
// delle automazioni di piattaforma: quello richiede un flusso configurato, e
// un flusso che qualcuno può disattivare per sbaglio non è il posto giusto
// per l'avviso "è entrato un cliente pagante".
//
// Destinatario: platform_settings.internal_alert_email → env INTERNAL_ALERT_EMAIL
// → fallback costante. Cambiarlo non richiede un deploy.
//
// Non lancia MAI: un avviso interno non deve far fallire un webhook Stripe che
// ha già incassato i soldi.
// ============================================================================

// deno-lint-ignore-file no-explicit-any
import { sendEmailUnified } from "./sendEmailUnified.ts";

const DESTINATARIO_DI_RISERVA = "flo.andriciuc@gmail.com";

async function destinatario(admin: any): Promise<string> {
  try {
    const { data } = await admin
      .from("platform_settings")
      .select("value")
      .eq("key", "internal_alert_email")
      .maybeSingle();
    const v = typeof data?.value === "string" ? data.value : (data?.value as any)?.email;
    if (v && String(v).includes("@")) return String(v).trim();
  } catch { /* best-effort */ }
  return Deno.env.get("INTERNAL_ALERT_EMAIL") || DESTINATARIO_DI_RISERVA;
}

export async function notificaInterna(admin: any, opts: {
  /** Riga dell'oggetto, già leggibile da sola nella lista della posta. */
  oggetto: string;
  /** Il fatto, in una frase. */
  sommario: string;
  /** Coppie etichetta/valore mostrate in tabella. */
  dettagli?: [string, string][];
  /** Link su cui atterrare (es. scheda azienda in super_admin). */
  url?: string;
  /** Etichetta del pulsante. */
  urlLabel?: string;
  /** Chiave anti-doppione: se già inviata, non riparte. */
  dedupeKey?: string;
}): Promise<boolean> {
  try {
    if (opts.dedupeKey) {
      const { data: dup } = await admin
        .from("lifecycle_email_sends")
        .select("id")
        .eq("template_key", "internal_alert")
        .eq("metadata->>dedupe_key", opts.dedupeKey)
        .limit(1)
        .maybeSingle();
      if (dup) return false;
    }

    const to = await destinatario(admin);
    const righe = (opts.dettagli ?? [])
      .map(([k, v]) =>
        `<tr><td style="padding:6px 12px;border-bottom:1px solid #eef1f5;font-size:13px;color:#64748b;width:40%;">${esc(k)}</td>` +
        `<td style="padding:6px 12px;border-bottom:1px solid #eef1f5;font-size:14px;font-weight:600;color:#1a1a1a;">${esc(v)}</td></tr>`)
      .join("");

    const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;">
  <p style="font-size:16px;margin:0 0 14px;">${esc(opts.sommario)}</p>
  ${righe ? `<table role="presentation" width="100%" style="border:1px solid #e6eaf0;border-radius:8px;border-collapse:collapse;overflow:hidden;">${righe}</table>` : ""}
  ${opts.url ? `<p style="margin:18px 0 0;"><a href="${opts.url}" style="display:inline-block;background:#F97316;color:#fff;text-decoration:none;padding:11px 22px;border-radius:6px;font-weight:600;font-size:14px;">${esc(opts.urlLabel ?? "Apri")}</a></p>` : ""}
  <p style="margin:20px 0 0;font-size:12px;color:#94a3b8;">Avviso interno EdiliziaInCloud — non inviato al cliente.</p>
</div>`;

    const testo = [
      opts.sommario, "",
      ...(opts.dettagli ?? []).map(([k, v]) => `${k}: ${v}`),
      opts.url ? `\n${opts.url}` : "",
    ].join("\n");

    const res = await sendEmailUnified({
      companyId: null,          // avviso di piattaforma: nessun addebito al tenant
      stream: "transactional",
      to: [to],
      subject: opts.oggetto,
      html,
      text: testo,
      templateName: "internal_alert",
      skipCredits: true,
      platformSender: true,
      adminClient: admin,
      metadata: { internal_alert: true, dedupe_key: opts.dedupeKey ?? null },
    });

    await admin.from("lifecycle_email_sends").insert({
      company_id: null,
      template_key: "internal_alert",
      email_to: to,
      delivery_status: res.ok ? "sent" : "failed",
      metadata: { dedupe_key: opts.dedupeKey ?? null, oggetto: opts.oggetto },
    });

    return res.ok;
  } catch (e) {
    console.warn("[notificaInterna] invio fallito:", (e as Error)?.message);
    return false;
  }
}

function esc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
