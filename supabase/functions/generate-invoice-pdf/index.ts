import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

function buildHtml(invoice: Record<string, any>, lines: Record<string, any>[], company: Record<string, any>): string {
  const docLabel = invoice.document_type === "credit_note" ? "NOTA DI CREDITO" : invoice.document_type === "proforma" ? "PROFORMA" : "FATTURA";

  const linesHtml = lines
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    .map(l => `
      <tr>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;">${escHtml(l.description)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;">${l.quantity} ${escHtml(l.unit)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${fmtEur(Number(l.unit_price))}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;">${Number(l.discount_percent)}%</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;">${Number(l.tax_rate)}%</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;font-weight:600;">${fmtEur(Number(l.line_gross))}</td>
      </tr>
    `).join("");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  @page { size: A4; margin: 20mm; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #1a1a1a; line-height: 1.5; margin: 0; padding: 0; }
  .header { display: flex; justify-content: space-between; margin-bottom: 30px; }
  .company-name { font-size: 18px; font-weight: 700; color: #0f172a; }
  .doc-title { font-size: 22px; font-weight: 700; color: #0f172a; text-align: right; }
  .doc-number { font-size: 13px; color: #64748b; text-align: right; }
  .section { margin-bottom: 20px; }
  .section-label { font-size: 9px; text-transform: uppercase; color: #94a3b8; letter-spacing: 1px; margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; }
  thead th { background: #f1f5f9; padding: 8px; font-size: 10px; text-transform: uppercase; color: #475569; letter-spacing: 0.5px; text-align: left; }
  .totals { margin-top: 16px; display: flex; justify-content: flex-end; }
  .totals-table td { padding: 4px 12px; }
  .totals-table .grand { font-size: 16px; font-weight: 700; border-top: 2px solid #0f172a; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 9px; color: #94a3b8; }
</style>
</head><body>
<div class="header">
  <div>
    <div class="company-name">${escHtml(company.name)}</div>
    ${company.vat_number ? `<div>P.IVA: ${escHtml(company.vat_number)}</div>` : ""}
    ${company.fiscal_code ? `<div>C.F.: ${escHtml(company.fiscal_code)}</div>` : ""}
    ${company.address ? `<div>${escHtml(company.address)}</div>` : ""}
    ${company.city ? `<div>${escHtml(company.city)} ${escHtml(company.zip || "")}</div>` : ""}
    ${company.phone ? `<div>Tel: ${escHtml(company.phone)}</div>` : ""}
    ${company.email ? `<div>${escHtml(company.email)}</div>` : ""}
  </div>
  <div>
    <div class="doc-title">${docLabel}</div>
    <div class="doc-number">N° ${escHtml(invoice.invoice_number) || "BOZZA"}</div>
    <div style="text-align:right;margin-top:8px;">
      <div>Data: ${fmtDate(invoice.issue_date)}</div>
      ${invoice.due_date ? `<div>Scadenza: ${fmtDate(invoice.due_date)}</div>` : ""}
    </div>
  </div>
</div>

<div class="section">
  <div class="section-label">Destinatario</div>
  <div style="font-weight:600;font-size:13px;">${escHtml(invoice.client_company_name)}</div>
  ${invoice.client_vat_number ? `<div>P.IVA: ${escHtml(invoice.client_vat_number)}</div>` : ""}
  ${invoice.client_fiscal_code ? `<div>C.F.: ${escHtml(invoice.client_fiscal_code)}</div>` : ""}
  ${invoice.client_address ? `<div>${escHtml(invoice.client_address)}</div>` : ""}
  ${invoice.client_city ? `<div>${escHtml(invoice.client_city)} ${escHtml(invoice.client_zip || "")}</div>` : ""}
  ${invoice.client_pec ? `<div>PEC: ${escHtml(invoice.client_pec)}</div>` : ""}
  ${invoice.client_sdi_code ? `<div>SDI: ${escHtml(invoice.client_sdi_code)}</div>` : ""}
</div>

<table>
  <thead>
    <tr>
      <th>Descrizione</th>
      <th style="text-align:center;">Q.tà</th>
      <th style="text-align:right;">Prezzo unit.</th>
      <th style="text-align:center;">Sc.%</th>
      <th style="text-align:center;">IVA</th>
      <th style="text-align:right;">Totale</th>
    </tr>
  </thead>
  <tbody>${linesHtml}</tbody>
</table>

<div class="totals">
  <table class="totals-table">
    <tr><td style="color:#64748b;">Imponibile</td><td style="text-align:right;">${fmtEur(Number(invoice.subtotal))}</td></tr>
    <tr><td style="color:#64748b;">IVA</td><td style="text-align:right;">${fmtEur(Number(invoice.tax_amount))}</td></tr>
    <tr class="grand"><td>TOTALE</td><td style="text-align:right;">${fmtEur(Number(invoice.total))}</td></tr>
  </table>
</div>

<div class="section" style="margin-top:24px;">
  <div class="section-label">Pagamento</div>
  <div>${escHtml(invoice.payment_terms || invoice.payment_method || "")}</div>
  ${invoice.bank_iban ? `<div>IBAN: ${escHtml(invoice.bank_iban)}</div>` : ""}
</div>

${invoice.footer_text ? `<div class="footer">${escHtml(invoice.footer_text)}</div>` : ""}
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const { invoice_id } = await req.json();
    if (!invoice_id) return new Response(JSON.stringify({ error: "invoice_id required" }), { status: 400, headers: corsHeaders });

    // Fetch invoice with lines
    const { data: invoice, error: invErr } = await supabase
      .from("invoices").select("*, invoice_lines(*)").eq("id", invoice_id).single();
    if (invErr || !invoice) return new Response(JSON.stringify({ error: "Invoice not found" }), { status: 404, headers: corsHeaders });

    // Fetch company
    const { data: company } = await supabase
      .from("companies").select("name, vat_number, fiscal_code, address, city, zip, phone, email").eq("id", invoice.company_id).single();

    const html = buildHtml(invoice, invoice.invoice_lines || [], company || { name: "Azienda" });

    return new Response(JSON.stringify({ html }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-invoice-pdf error:", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
