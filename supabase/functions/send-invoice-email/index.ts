import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadProviderSettings, sendEmail } from "../_shared/emailProvider.ts";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function escHtml(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtEur(n: number): string {
  return `€${n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function buildEmailHtml(invoice: Record<string, any>, lines: Record<string, any>[], company: Record<string, any>, customMessage?: string): string {
  const docLabel = invoice.document_type === "credit_note" ? "Nota di credito" : invoice.document_type === "proforma" ? "Proforma" : "Fattura";

  const linesHtml = lines
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    .map(l => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;">${escHtml(l.description)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:center;font-size:13px;">${l.quantity}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-size:13px;">${fmtEur(Number(l.unit_price))}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-size:13px;font-weight:600;">${fmtEur(Number(l.line_gross))}</td>
      </tr>
    `).join("");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

<!-- Header -->
<tr><td style="background:#0f172a;padding:24px 32px;">
  <table width="100%"><tr>
    <td><span style="color:#ffffff;font-size:18px;font-weight:700;">${escHtml(company.name)}</span></td>
    <td style="text-align:right;"><span style="color:#94a3b8;font-size:13px;">${docLabel} N° ${escHtml(invoice.invoice_number) || "—"}</span></td>
  </tr></table>
</td></tr>

<!-- Body -->
<tr><td style="padding:32px;">

${customMessage ? `<p style="font-size:14px;color:#334155;margin:0 0 24px;line-height:1.6;">${escHtml(customMessage)}</p>` : ""}

<p style="font-size:14px;color:#334155;margin:0 0 16px;">
  Gentile <strong>${escHtml(invoice.client_company_name)}</strong>,<br>
  ${customMessage ? "" : `di seguito i dettagli della ${docLabel.toLowerCase()} N° <strong>${escHtml(invoice.invoice_number) || "—"}</strong>.`}
</p>

<!-- Invoice Summary -->
<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;background:#f8fafc;border-radius:8px;">
<tr>
  <td style="padding:16px;">
    <table width="100%" style="font-size:13px;color:#475569;">
      <tr><td>Data emissione:</td><td style="text-align:right;font-weight:600;">${fmtDate(invoice.issue_date)}</td></tr>
      ${invoice.due_date ? `<tr><td>Scadenza:</td><td style="text-align:right;font-weight:600;">${fmtDate(invoice.due_date)}</td></tr>` : ""}
      <tr><td>Metodo di pagamento:</td><td style="text-align:right;">${escHtml(invoice.payment_method || "—")}</td></tr>
      ${invoice.bank_iban ? `<tr><td>IBAN:</td><td style="text-align:right;font-family:monospace;font-size:12px;">${escHtml(invoice.bank_iban)}</td></tr>` : ""}
    </table>
  </td>
</tr>
</table>

<!-- Lines -->
<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
<thead>
  <tr style="background:#f1f5f9;">
    <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#64748b;letter-spacing:0.5px;">Descrizione</th>
    <th style="padding:10px 12px;text-align:center;font-size:11px;text-transform:uppercase;color:#64748b;">Q.tà</th>
    <th style="padding:10px 12px;text-align:right;font-size:11px;text-transform:uppercase;color:#64748b;">Prezzo</th>
    <th style="padding:10px 12px;text-align:right;font-size:11px;text-transform:uppercase;color:#64748b;">Totale</th>
  </tr>
</thead>
<tbody>${linesHtml}</tbody>
</table>

<!-- Totals -->
<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
  <tr><td></td><td width="200" style="text-align:right;padding:4px 12px;font-size:13px;color:#64748b;">Imponibile:</td><td width="100" style="text-align:right;padding:4px 12px;font-size:13px;">${fmtEur(Number(invoice.subtotal))}</td></tr>
  <tr><td></td><td style="text-align:right;padding:4px 12px;font-size:13px;color:#64748b;">IVA:</td><td style="text-align:right;padding:4px 12px;font-size:13px;">${fmtEur(Number(invoice.tax_amount))}</td></tr>
  <tr><td></td><td style="text-align:right;padding:8px 12px;font-size:16px;font-weight:700;border-top:2px solid #0f172a;">TOTALE:</td><td style="text-align:right;padding:8px 12px;font-size:16px;font-weight:700;border-top:2px solid #0f172a;">${fmtEur(Number(invoice.total))}</td></tr>
</table>

${invoice.footer_text ? `<p style="font-size:12px;color:#94a3b8;margin:24px 0 0;padding-top:16px;border-top:1px solid #e2e8f0;">${escHtml(invoice.footer_text)}</p>` : ""}

</td></tr>

<!-- Footer -->
<tr><td style="background:#f8fafc;padding:16px 32px;text-align:center;">
  <p style="font-size:11px;color:#94a3b8;margin:0;">${escHtml(company.name)}${company.vat_number ? ` · P.IVA ${escHtml(company.vat_number)}` : ""}${company.email ? ` · ${escHtml(company.email)}` : ""}</p>
</td></tr>

</table>
</td></tr>
</table>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const { invoice_id, to_email, subject, message } = await req.json();
    if (!invoice_id || !to_email) return json({ error: "invoice_id and to_email required" }, 400);

    // Fetch invoice + lines
    const { data: invoice, error: invErr } = await supabase
      .from("invoices").select("*, invoice_lines(*)").eq("id", invoice_id).single();
    if (invErr || !invoice) return json({ error: "Invoice not found" }, 404);

    // Fetch company
    const { data: company } = await supabase
      .from("companies").select("name, vat_number, fiscal_code, address, city, zip, phone, email")
      .eq("id", invoice.company_id).single();

    const companyData = company || { name: "Azienda" };
    const docLabel = invoice.document_type === "credit_note" ? "Nota di credito" : invoice.document_type === "proforma" ? "Proforma" : "Fattura";
    const emailSubject = subject || `${docLabel} N° ${invoice.invoice_number || "—"} — ${companyData.name}`;
    const emailHtml = buildEmailHtml(invoice, invoice.invoice_lines || [], companyData, message);

    // Try transactional stream first, fallback to marketing
    let settings;
    try {
      settings = await loadProviderSettings("transactional");
      if (!settings.apiKey) throw new Error("No transactional key");
    } catch {
      settings = await loadProviderSettings("marketing");
    }

    if (!settings.apiKey) {
      return json({ error: "Nessun provider email configurato. Configura un provider nelle impostazioni della piattaforma." }, 400);
    }

    const result = await sendEmail(settings, {
      from: settings.fromDefault,
      to: [to_email],
      subject: emailSubject,
      html: emailHtml,
    });

    if (!result.ok) {
      console.error("Email send failed:", result);
      return json({ error: `Invio email fallito (status ${result.status})` }, 500);
    }

    // Log the send
    await supabase.from("billing_sync_log").insert({
      company_id: invoice.company_id,
      invoice_id: invoice.id,
      provider: "email",
      direction: "push",
      action: "send_email",
      status: "success",
      response_payload: { to: to_email, subject: emailSubject } as any,
    });

    return json({ success: true });
  } catch (e) {
    console.error("send-invoice-email error:", e);
    return json({ error: String(e) }, 500);
  }
});
