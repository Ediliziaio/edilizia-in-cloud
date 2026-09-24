import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyCompanyAccess } from "../_shared/companyAuth.ts";
import { getCorsHeaders } from "../_shared/headers.ts";
import { getBrandingForCompany } from "../_shared/getBranding.ts";
import { logoDiRiserva } from "../_shared/logoAzienda.ts";

function escHtml(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const parts = d.split("T")[0].split("-");
  if (parts.length !== 3) return d;
  const [y, m, day] = parts;
  return `${day}/${m}/${y}`;
}

function fmtEur(n: number): string {
  return `€${n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface SalVoce {
  id: string;
  descrizione: string;
  importo_contrattuale: number;
  percentuale_avanzamento: number;
  importo_sal: number;
  note: string | null;
}

interface SalRecord {
  id: string;
  numero_sal: number;
  data_emissione: string;
  stato: string;
  importo_totale: number;
  note: string | null;
  order_id: string;
  company_id: string;
  sal_voci: SalVoce[];
}

interface Order {
  description: string;
  order_code: string | null;
  total_amount: number | null;
}

interface Azienda {
  ragione_sociale: string;
  partita_iva: string | null;
  colore_primario: string | null;
  logo_url: string | null;
  indirizzo?: string | null;
  citta?: string | null;
  cap?: string | null;
  telefono?: string | null;
  email?: string | null;
}

const STATO_LABELS: Record<string, string> = {
  bozza: "BOZZA",
  emesso: "EMESSO",
  approvato: "APPROVATO",
};

function buildSalHtml(sal: SalRecord, order: Order | null, azienda: Azienda, signatureUrl?: string | null, brandFooter?: string): string {
  const colore = azienda.colore_primario || "#0ea5e9";
  const voci: SalVoce[] = sal.sal_voci || [];
  const totaleContrattuale = voci.reduce((s, v) => s + v.importo_contrattuale, 0);
  const totaleSal = voci.reduce((s, v) => s + v.importo_sal, 0);
  const percMedia = totaleContrattuale > 0 ? (totaleSal / totaleContrattuale) * 100 : 0;

  const indirizzo = [azienda.indirizzo, azienda.cap, azienda.citta].filter(Boolean).join(", ");

  const vociHtml = voci
    .map(
      (v, i) => `
    <tr style="background:${i % 2 === 1 ? "#f8fafc" : "white"};border-bottom:1px solid #f1f5f9;">
      <td style="padding:7px 10px;font-size:9pt;">${escHtml(v.descrizione)}</td>
      <td style="padding:7px 10px;text-align:right;font-size:9pt;">${fmtEur(v.importo_contrattuale)}</td>
      <td style="padding:7px 10px;text-align:center;font-size:9pt;">
        <div style="display:inline-flex;align-items:center;gap:6px;">
          <div style="width:60px;height:8px;background:#e2e8f0;border-radius:4px;overflow:hidden;">
            <div style="width:${v.percentuale_avanzamento}%;height:100%;background:${colore};border-radius:4px;"></div>
          </div>
          <span style="font-weight:600;">${v.percentuale_avanzamento}%</span>
        </div>
      </td>
      <td style="padding:7px 10px;text-align:right;font-size:9pt;font-weight:600;color:${colore};">${fmtEur(v.importo_sal)}</td>
    </tr>
    ${v.note ? `<tr style="background:${i % 2 === 1 ? "#f8fafc" : "white"};border-bottom:1px solid #f1f5f9;"><td colspan="4" style="padding:3px 10px 7px;font-size:7.5pt;color:#94a3b8;font-style:italic;">${escHtml(v.note)}</td></tr>` : ""}
  `,
    )
    .join("");

  const statoLabel = STATO_LABELS[sal.stato] || sal.stato.toUpperCase();
  const statoColor =
    sal.stato === "approvato" ? "#22c55e" : sal.stato === "emesso" ? colore : "#94a3b8";

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8" />
  <title>SAL #${sal.numero_sal}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: Arial, sans-serif; font-size: 10pt; color: #1e293b; background: white; }
    @media print {
      body { margin: 0; }
      @page { margin: 1.5cm; size: A4; }
    }
    .page { max-width: 794px; margin: 0 auto; padding: 32px; }
  </style>
</head>
<body>
<div class="page">

  <!-- Header azienda -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid ${colore};">
    <div>
      <div style="font-size:14pt;font-weight:700;color:${colore};">${escHtml(azienda.ragione_sociale)}</div>
      ${azienda.partita_iva ? `<div style="font-size:8pt;color:#64748b;">P.IVA ${escHtml(azienda.partita_iva)}</div>` : ""}
      ${indirizzo ? `<div style="font-size:8pt;color:#64748b;">${escHtml(indirizzo)}</div>` : ""}
      ${azienda.telefono ? `<div style="font-size:8pt;color:#64748b;">Tel. ${escHtml(azienda.telefono)}</div>` : ""}
      ${azienda.email ? `<div style="font-size:8pt;color:#64748b;">${escHtml(azienda.email)}</div>` : ""}
    </div>
    ${
      azienda.logo_url
        ? `<img src="${escHtml(azienda.logo_url)}" alt="Logo" style="max-height:60px;max-width:180px;object-fit:contain;" />`
        : ""
    }
  </div>

  <!-- Titolo documento -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;">
    <div>
      <div style="font-size:16pt;font-weight:700;color:#0f172a;">STATO AVANZAMENTO LAVORI N° ${sal.numero_sal}</div>
      ${
        order
          ? `<div style="font-size:9pt;color:#475569;margin-top:4px;">
          Cantiere: ${order.order_code ? `#${escHtml(order.order_code)} — ` : ""}${escHtml(order.description)}
        </div>`
          : ""
      }
      <div style="font-size:8pt;color:#94a3b8;margin-top:2px;">Data emissione: ${fmtDate(sal.data_emissione)}</div>
    </div>
    <div style="text-align:right;">
      <div style="display:inline-block;background:${statoColor};color:white;font-size:8pt;font-weight:700;padding:4px 10px;border-radius:4px;letter-spacing:0.5px;">${statoLabel}</div>
    </div>
  </div>

  <!-- Summary cards -->
  <div style="display:flex;gap:12px;margin-bottom:20px;">
    <div style="flex:1;border:1px solid #e2e8f0;border-radius:6px;padding:10px 12px;">
      <div style="font-size:7.5pt;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;">Importo Contrattuale</div>
      <div style="font-size:13pt;font-weight:700;color:#0f172a;">${fmtEur(totaleContrattuale)}</div>
    </div>
    <div style="flex:1;border:1px solid #e2e8f0;border-radius:6px;padding:10px 12px;">
      <div style="font-size:7.5pt;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;">Avanzamento Medio</div>
      <div style="font-size:13pt;font-weight:700;color:${colore};">${percMedia.toFixed(1)}%</div>
    </div>
    <div style="flex:1;border:1px solid ${colore};border-radius:6px;padding:10px 12px;background:${colore}10;">
      <div style="font-size:7.5pt;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;">Totale SAL</div>
      <div style="font-size:13pt;font-weight:700;color:${colore};">${fmtEur(totaleSal)}</div>
    </div>
  </div>

  <!-- Voci table -->
  <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;margin-bottom:20px;">
    <thead>
      <tr style="background:${colore};color:white;">
        <th style="padding:8px 10px;text-align:left;font-size:8.5pt;font-weight:600;">Voce / Lavorazione</th>
        <th style="padding:8px 10px;text-align:right;font-size:8.5pt;font-weight:600;">Importo Contrattuale</th>
        <th style="padding:8px 10px;text-align:center;font-size:8.5pt;font-weight:600;">Avanzamento</th>
        <th style="padding:8px 10px;text-align:right;font-size:8.5pt;font-weight:600;">Importo SAL</th>
      </tr>
    </thead>
    <tbody>
      ${vociHtml}
    </tbody>
    <tfoot>
      <tr style="background:#f8fafc;font-weight:700;border-top:2px solid #e2e8f0;">
        <td style="padding:9px 10px;font-size:9.5pt;">TOTALE</td>
        <td style="padding:9px 10px;text-align:right;font-size:9.5pt;">${fmtEur(totaleContrattuale)}</td>
        <td style="padding:9px 10px;text-align:center;font-size:9.5pt;">${percMedia.toFixed(1)}%</td>
        <td style="padding:9px 10px;text-align:right;font-size:9.5pt;color:${colore};">${fmtEur(totaleSal)}</td>
      </tr>
    </tfoot>
  </table>

  ${sal.note ? `
  <div style="background:#f8fafc;border-left:3px solid ${colore};padding:10px 14px;border-radius:0 4px 4px 0;margin-bottom:20px;">
    <div style="font-size:8pt;font-weight:600;color:#475569;margin-bottom:3px;">NOTE</div>
    <div style="font-size:9pt;color:#475569;white-space:pre-wrap;">${escHtml(sal.note)}</div>
  </div>
  ` : ""}

  <!-- Firma DL -->
  <div style="margin-top:30px;display:flex;justify-content:space-between;gap:20px;">
    <div style="flex:1;border-top:1px solid #cbd5e1;padding-top:8px;">
      <div style="font-size:8pt;color:#94a3b8;">Direttore dei Lavori</div>
      <div style="margin-top:32px;font-size:7.5pt;color:#94a3b8;">Firma e timbro</div>
    </div>
    <div style="flex:1;border-top:1px solid #cbd5e1;padding-top:8px;">
      <div style="font-size:8pt;color:#94a3b8;">Appaltatore</div>
      <div style="margin-top:32px;font-size:7.5pt;color:#94a3b8;">Firma e timbro</div>
    </div>
    <div style="flex:1;border-top:1px solid #cbd5e1;padding-top:8px;">
      <div style="font-size:8pt;color:#94a3b8;">Committente</div>
      ${signatureUrl ? `
      <div style="margin-top:8px;font-size:7.5pt;color:#3b82f6;">
        ✍ Firma digitale: <a href="${signatureUrl}" style="color:#3b82f6;">${signatureUrl}</a>
      </div>
      <div style="margin-top:4px;font-size:7pt;color:#94a3b8;">Valido 7 giorni dalla generazione</div>
      ` : `<div style="margin-top:32px;font-size:7.5pt;color:#94a3b8;">Firma e timbro</div>`}
    </div>
  </div>

  <!-- Footer -->
  <div style="margin-top:40px;padding-top:10px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:7pt;color:#94a3b8;">
    <div>${escHtml(azienda.ragione_sociale)} — P.IVA ${escHtml(azienda.partita_iva)}</div>
    <div style="color:${colore};">${brandFooter || "Edilizia in Cloud"}</div>
  </div>

</div>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Non autorizzato" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Non autorizzato" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }
    const userId = user.id;

    const { sal_id, company_id } = await req.json();
    if (!sal_id || !company_id) {
      return new Response(JSON.stringify({ error: "sal_id e company_id obbligatori" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Verify access
    try {
      await verifyCompanyAccess(supabase, userId, company_id);
    } catch {
      return new Response(JSON.stringify({ error: "Non autorizzato: accesso negato" }), {
        status: 403,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Fetch SAL with voci
    const { data: sal, error: salErr } = await supabase
      .from("sal_records")
      .select("*, sal_voci(id, descrizione, importo_contrattuale, percentuale_avanzamento, importo_sal, note)")
      .eq("id", sal_id)
      .eq("company_id", company_id)
      .single();

    if (salErr || !sal) {
      return new Response(JSON.stringify({ error: "SAL non trovato" }), {
        status: 404,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Fetch order
    const { data: order } = await supabase
      .from("orders")
      .select("description, order_code, total_amount")
      .eq("id", sal.order_id)
      .single();

    // Fetch azienda
    const { data: azienda } = await supabase
      .from("anagrafica_azienda")
      .select("ragione_sociale, partita_iva, colore_primario, logo_url, indirizzo, citta, cap, telefono, email")
      .eq("company_id", company_id)
      .single();

    if (!azienda) {
      return new Response(JSON.stringify({ error: "Anagrafica azienda non configurata" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Il logo dell'anagrafica vince; vuoto vale quello aziendale (_shared/logoAzienda.ts).
    const { data: profiloAzienda } = await supabase
      .from("companies")
      .select("logo_url")
      .eq("id", company_id)
      .maybeSingle();
    azienda.logo_url = logoDiRiserva(azienda.logo_url, profiloAzienda?.logo_url);

    const salWithVoci: SalRecord = {
      ...sal,
      sal_voci: Array.isArray(sal.sal_voci) ? sal.sal_voci : [],
    };

    // Token di firma per il committente: RIUSA quello ancora valido e non
    // firmato — prima ogni export ne inseriva uno nuovo, lasciando righe
    // orfane a ogni click e invalidando di fatto i PDF già inviati.
    const { data: tokenEsistente } = await supabase
      .from("sal_signature_tokens")
      .select("token")
      .eq("sal_id", sal_id)
      .is("signed_at", null)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const signToken = tokenEsistente ?? (await supabase
      .from("sal_signature_tokens")
      .insert({
        sal_id,
        company_id,
        token: crypto.randomUUID(),
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      })
      .select("token")
      .single()).data;

    // Branding dinamico
    const branding = await getBrandingForCompany(supabase, company_id);
    const brandFooter = branding.hidePoweredBy
      ? branding.platformName
      : `${branding.platformName} — ${branding.siteUrl.replace("https://", "")}`;

    const signatureUrl = signToken?.token
      ? `${branding.siteUrl}/firma-sal/${signToken.token}`
      : null;

    const html = buildSalHtml(salWithVoci, order, azienda, signatureUrl, brandFooter);
    const filename = `sal-${sal.numero_sal}-${sal.data_emissione}.html`;

    return new Response(JSON.stringify({ html, filename, signature_url: signatureUrl, signature_token: signToken?.token }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-sal-pdf error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
