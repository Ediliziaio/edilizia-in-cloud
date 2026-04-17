import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";
import { verifyCompanyAccess } from "../_shared/companyAuth.ts";
import { getCorsHeaders } from "../_shared/headers.ts";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtEur(n: number | null): string {
  return `€${(n ?? 0).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

const TIPO_LABELS: Record<string, string> = {
  fattura: "Fattura", fattura_pa: "Fattura PA", proforma: "Proforma",
  nota_credito: "Nota di Credito", nota_debito: "Nota di Debito",
  ddt: "DDT", parcella: "Parcella", preventivo: "Preventivo",
  fattura_accompagnatoria: "Fattura Accompagnatoria",
  fattura_riepilogativa: "Fattura Riepilogativa",
};

interface RigaDoc {
  descrizione?: string;
  quantita?: number;
  prezzo_unitario?: number;
  aliquota_iva?: string;
  totale_riga?: number;
}

function buildEmailHtml(
  doc: Record<string, any>,
  company: Record<string, any>,
  customMessage?: string
): string {
  const tipo = doc.tipo as string;
  const docLabel = TIPO_LABELS[tipo] || "Documento";
  const cliente = doc.cliente_snapshot as Record<string, any> | null;
  const clienteName = cliente?.ragione_sociale || cliente?.nome
    ? `${cliente.nome || ""} ${cliente.cognome || ""}`.trim()
    : "Cliente";
  const righe = (doc.righe || []) as RigaDoc[];

  const linesHtml = righe.map(r => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;">${esc(r.descrizione)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:center;font-size:13px;">${r.quantita ?? 1}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-size:13px;">${fmtEur(r.prezzo_unitario ?? 0)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-size:13px;font-weight:600;">${fmtEur(r.totale_riga ?? 0)}</td>
    </tr>
  `).join("");

  const companyName = company.ragione_sociale || company.nome_commerciale || "Azienda";
  const companyVat = company.partita_iva || "";
  const companyEmail = company.email || "";

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

<!-- Header -->
<tr><td style="background:#0f172a;padding:24px 32px;">
  <table width="100%"><tr>
    <td><span style="color:#ffffff;font-size:18px;font-weight:700;">${esc(companyName)}</span></td>
    <td style="text-align:right;"><span style="color:#94a3b8;font-size:13px;">${docLabel} N° ${esc(doc.numero)}</span></td>
  </tr></table>
</td></tr>

<!-- Body -->
<tr><td style="padding:32px;">

${customMessage ? `<p style="font-size:14px;color:#334155;margin:0 0 24px;line-height:1.6;">${esc(customMessage)}</p>` : ""}

<p style="font-size:14px;color:#334155;margin:0 0 16px;">
  Gentile <strong>${esc(clienteName)}</strong>,<br>
  ${customMessage ? "" : `in allegato trova la ${docLabel.toLowerCase()} N° <strong>${esc(doc.numero)}</strong>.`}
</p>

<!-- Summary -->
<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;background:#f8fafc;border-radius:8px;">
<tr><td style="padding:16px;">
  <table width="100%" style="font-size:13px;color:#475569;">
    <tr><td>Data emissione:</td><td style="text-align:right;font-weight:600;">${fmtDate(doc.data_emissione)}</td></tr>
    ${doc.data_scadenza ? `<tr><td>Scadenza:</td><td style="text-align:right;font-weight:600;">${fmtDate(doc.data_scadenza)}</td></tr>` : ""}
    ${doc.metodo_pagamento_codice ? `<tr><td>Metodo pagamento:</td><td style="text-align:right;">${esc(doc.metodo_pagamento_codice)}</td></tr>` : ""}
    ${doc.iban_pagamento ? `<tr><td>IBAN:</td><td style="text-align:right;font-family:monospace;font-size:12px;">${esc(doc.iban_pagamento)}</td></tr>` : ""}
  </table>
</td></tr>
</table>

${righe.length > 0 ? `
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
</table>` : ""}

<!-- Totals -->
<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
  <tr><td></td><td width="200" style="text-align:right;padding:4px 12px;font-size:13px;color:#64748b;">Imponibile:</td><td width="100" style="text-align:right;padding:4px 12px;font-size:13px;">${fmtEur(doc.imponibile_totale)}</td></tr>
  <tr><td></td><td style="text-align:right;padding:4px 12px;font-size:13px;color:#64748b;">IVA:</td><td style="text-align:right;padding:4px 12px;font-size:13px;">${fmtEur(doc.iva_totale)}</td></tr>
  <tr><td></td><td style="text-align:right;padding:8px 12px;font-size:16px;font-weight:700;border-top:2px solid #0f172a;">TOTALE:</td><td style="text-align:right;padding:8px 12px;font-size:16px;font-weight:700;border-top:2px solid #0f172a;">${fmtEur(doc.totale_da_pagare)}</td></tr>
</table>

</td></tr>

<!-- Footer -->
<tr><td style="background:#f8fafc;padding:16px 32px;text-align:center;">
  <p style="font-size:11px;color:#94a3b8;margin:0;">${esc(companyName)}${companyVat ? ` · P.IVA ${esc(companyVat)}` : ""}${companyEmail ? ` · ${esc(companyEmail)}` : ""}</p>
</td></tr>

</table>
</td></tr>
</table>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const { documento_id, to_email, subject, message } = await req.json();
    if (!documento_id || !to_email) return json({ error: "documento_id and to_email required" }, 400);

    // Fetch document
    const { data: doc, error: docErr } = await supabase
      .from("documenti_fiscali").select("*").eq("id", documento_id).single();
    if (docErr || !doc) return json({ error: "Documento non trovato" }, 404);

    // Verify access
    try {
      await verifyCompanyAccess(supabase, user.id, doc.company_id);
    } catch {
      return json({ error: "Non autorizzato" }, 403);
    }

    // Fetch company profile
    const { data: company } = await supabase
      .from("anagrafica_azienda").select("*").eq("company_id", doc.company_id).single();
    const companyData = company || {};

    const tipo = doc.tipo as string;
    const docLabel = TIPO_LABELS[tipo] || "Documento";
    const emailSubject = subject || `${docLabel} N° ${doc.numero || "—"} — ${companyData.ragione_sociale || ""}`;
    const emailHtml = buildEmailHtml(doc, companyData, message);

    // Send via unified pipeline (quota-aware + auto-logged).
    let result = await sendEmailUnified({
      companyId:    doc.company_id,
      stream:       "transactional",
      to:           [to_email],
      subject:      emailSubject,
      html:         emailHtml,
      templateName: "documento_send",
      adminClient:  supabase,
      metadata:     { documento_id: doc.id, tipo: doc.tipo },
    });

    if (!result.ok && String((result.body as any)?.error ?? "").toLowerCase().includes("no provider configured")) {
      result = await sendEmailUnified({
        companyId:    doc.company_id,
        stream:       "marketing",
        to:           [to_email],
        subject:      emailSubject,
        html:         emailHtml,
        templateName: "documento_send",
        adminClient:  supabase,
        metadata:     { documento_id: doc.id, tipo: doc.tipo, fallback_stream: true },
      });
    }

    if (!result.ok) {
      console.error("Email send failed:", result);
      const msg =
        result.status === 402
          ? "Crediti email insufficienti — ricarica il wallet per continuare."
          : `Invio email fallito (status ${result.status})`;
      return json({ error: msg }, result.status === 402 ? 402 : 500);
    }

    // Legacy billing_sync_log entry (indexed by document id)
    await supabase.from("billing_sync_log").insert({
      company_id: doc.company_id,
      invoice_id: doc.id,
      provider: "email",
      direction: "push",
      action: "send_documento_email",
      status: "success",
      response_payload: {
        to: to_email,
        subject: emailSubject,
        provider_message_id: result.providerMessageId ?? null,
        over_quota: result.overQuota ?? false,
        charged_eur: result.chargedEur ?? 0,
      } as any,
    }).catch(() => {});

    return json({
      success:     true,
      over_quota:  result.overQuota ?? false,
      charged_eur: result.chargedEur ?? 0,
      is_free:     result.isFree ?? false,
    });
  } catch (e) {
    console.error("send-documento-email error:", e);
    return json({ error: String(e) }, 500);
  }
});
