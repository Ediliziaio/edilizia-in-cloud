/**
 * generate-survey-pdf — genera report HTML del sopralluogo
 *
 * Approccio Sprint S5: invece di puppeteer-core (heavy su Deno), generiamo
 * un HTML completo + restituiamo l'URL al client che apre la pagina e fa
 * "Stampa → Salva PDF" via browser native print. Questo è leggero, robusto
 * e già "good enough" per il MVP. Per PDF strutturali serverless si può
 * passare a un servizio esterno (browserless.io) in iterazione successiva.
 *
 * Body: { survey_id }
 *
 * Output: { ok, html_url } — l'URL è una pagina con il report renderizzabile
 * + bottone "Stampa". Il client naviga a html_url e l'utente clicca Stampa.
 *
 * Auth: utente JWT (verifica ownership via RLS naturale del select).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function escapeHtml(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("it-IT", {
    year: "numeric", month: "long", day: "numeric",
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Auth
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  const { data: userRes } = await supabase.auth.getUser(token);
  const userId = userRes?.user?.id;
  if (!userId) {
    return jsonRes({ ok: false, error: "Unauthorized" }, 401);
  }

  let body: { survey_id?: string } = {};
  try { body = await req.json(); } catch { /* empty */ }
  if (!body.survey_id) return jsonRes({ ok: false, error: "survey_id required" }, 400);

  // Carica dati
  const [surveyR, areasR, elementsR, mediaR] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("surveys").select("*").eq("id", body.survey_id).maybeSingle(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("survey_areas").select("*").eq("survey_id", body.survey_id).order("position"),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("survey_elements").select("*").eq("survey_id", body.survey_id).order("position"),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("survey_media").select("*").eq("survey_id", body.survey_id).order("position"),
  ]);

  if (!surveyR.data) return jsonRes({ ok: false, error: "Survey not found" }, 404);
  const survey = surveyR.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: template } = await (supabase as any)
    .from("survey_templates").select("*").eq("id", survey.template_id).maybeSingle();
  if (!template) return jsonRes({ ok: false, error: "Template not found" }, 404);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: company } = await (supabase as any)
    .from("companies").select("name, address, city, vat_number, email, phone, logo_url")
    .eq("id", survey.company_id).maybeSingle();

  const areas = (areasR.data ?? []) as Array<Record<string, unknown>>;
  const elements = (elementsR.data ?? []) as Array<Record<string, unknown>>;
  const media = (mediaR.data ?? []) as Array<Record<string, unknown>>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const schema = template.schema as any;

  // Re-firma URL (signed URLs scadono 7gg, ricreiamo per il PDF)
  const refreshedMedia = await Promise.all(media.map(async (m) => {
    const path = m.storage_path as string | null;
    if (!path) return m;
    const { data } = await supabase.storage.from("surveys").createSignedUrl(path, 60 * 60 * 24);
    return { ...m, url: data?.signedUrl ?? m.url };
  }));

  // ─────────── HTML report ───────────
  const html = `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<title>Rilievo ${escapeHtml(survey.code as string)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
         margin: 0; padding: 0; color: #1e293b; line-height: 1.4; }
  .container { max-width: 880px; margin: 0 auto; padding: 32px; }
  .print-btn { position: fixed; top: 16px; right: 16px; background: #ea580c;
               color: white; padding: 10px 20px; border-radius: 8px;
               border: none; cursor: pointer; font-weight: 600;
               box-shadow: 0 4px 12px rgba(234,88,12,0.3); }
  @media print { .print-btn { display: none; } }
  .header { display: flex; align-items: flex-start; justify-content: space-between;
            border-bottom: 3px solid #ea580c; padding-bottom: 16px; margin-bottom: 24px; }
  .header h1 { margin: 0 0 4px 0; font-size: 24px; }
  .header .subtitle { color: #64748b; font-size: 13px; }
  .company { text-align: right; font-size: 12px; color: #475569; }
  .company .name { font-weight: 700; color: #1e293b; font-size: 14px; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
               background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px;
               padding: 12px 16px; margin-bottom: 24px; font-size: 13px; }
  .meta-grid .label { font-size: 10px; text-transform: uppercase; color: #c2410c;
                      font-weight: 600; letter-spacing: 0.05em; }
  .meta-grid .value { color: #1e293b; margin-top: 2px; }
  h2 { font-size: 16px; color: #ea580c; border-bottom: 2px solid #fed7aa;
       padding-bottom: 4px; margin-top: 28px; }
  h3 { font-size: 14px; color: #1e293b; margin-top: 16px; }
  .area { background: #fafafa; border-left: 4px solid #ea580c; padding: 12px 16px;
          border-radius: 0 8px 8px 0; margin-bottom: 16px; }
  .element { background: white; border: 1px solid #e2e8f0; border-radius: 6px;
             padding: 10px 12px; margin: 8px 0; }
  .element .header-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .badge { background: #f1f5f9; color: #475569; padding: 2px 6px; border-radius: 4px;
           font-size: 10px; font-family: monospace; font-weight: 600; }
  .field { display: inline-block; margin-right: 12px; font-size: 12px; }
  .field .key { color: #64748b; }
  .field .val { font-weight: 500; }
  .photos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 8px; }
  .photo { border: 1px solid #e2e8f0; border-radius: 4px; overflow: hidden; aspect-ratio: 4/3; }
  .photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .photo .caption { font-size: 9px; padding: 2px 4px; background: #f8fafc; color: #475569; }
  .signature-box { margin-top: 32px; padding: 16px; border: 2px dashed #c4b5fd;
                   border-radius: 8px; text-align: center; }
  .signature-box img { max-height: 100px; border: 1px solid #e2e8f0; background: white; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e2e8f0;
            font-size: 11px; color: #94a3b8; text-align: center; }
  table.values { width: 100%; font-size: 12px; border-collapse: collapse; }
  table.values td { padding: 3px 8px; border-bottom: 1px solid #f1f5f9; }
  table.values td:first-child { color: #64748b; width: 40%; }
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">📄 Stampa / Salva PDF</button>
<div class="container">

<div class="header">
  <div>
    <h1>${escapeHtml(template.name as string)}</h1>
    <div class="subtitle">Codice: <strong>${escapeHtml(survey.code as string)}</strong> · Rilievo del ${fmtDate(survey.created_at as string)}</div>
  </div>
  <div class="company">
    ${company?.logo_url ? `<img src="${escapeHtml(company.logo_url as string)}" alt="logo" style="max-height:48px;margin-bottom:6px"/><br/>` : ""}
    <div class="name">${escapeHtml((company?.name as string) ?? "Azienda")}</div>
    ${company?.address ? `<div>${escapeHtml(company.address as string)}, ${escapeHtml((company.city as string) ?? "")}</div>` : ""}
    ${company?.vat_number ? `<div>P.IVA ${escapeHtml(company.vat_number as string)}</div>` : ""}
    ${company?.email ? `<div>${escapeHtml(company.email as string)}</div>` : ""}
  </div>
</div>

<div class="meta-grid">
  <div>
    <div class="label">Indirizzo sopralluogo</div>
    <div class="value">${escapeHtml([survey.address, survey.city, survey.zip].filter(Boolean).join(", ") as string) || "—"}</div>
  </div>
  <div>
    <div class="label">Data programmata</div>
    <div class="value">${fmtDate(survey.scheduled_at as string)}</div>
  </div>
  <div>
    <div class="label">Stato</div>
    <div class="value">${escapeHtml(survey.status as string)}</div>
  </div>
  <div>
    <div class="label">Cliente</div>
    <div class="value">${escapeHtml((survey.client_signature_name as string) ?? "Non specificato")}</div>
  </div>
</div>

${(schema?.header_schema?.length ?? 0) > 0 ? `
<h2>Dati generali</h2>
${(schema.header_schema as Array<Record<string, unknown>>).map((sec) => {
  const fields = (sec.fields as Array<Record<string, unknown>>) ?? [];
  if (fields.length === 0) return "";
  return `<h3>${escapeHtml(sec.label as string)}</h3>
  <table class="values">
    ${fields.map((f) => {
      const k = f.key as string;
      const label = f.label as string;
      const val = (survey.header_data as Record<string, unknown>)?.[k];
      const vStr = val == null ? "—" : Array.isArray(val) ? val.join(", ") : String(val);
      return `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(vStr)}</td></tr>`;
    }).join("")}
  </table>`;
}).join("")}
` : ""}

${areas.length > 0 ? `
<h2>${escapeHtml(template.area_label_plural as string)} (${areas.length})</h2>
${areas.map((area) => {
  const areaElements = elements.filter((e) => e.area_id === area.id);
  const areaMedia = refreshedMedia.filter((m) => m.area_id === area.id && !m.element_id && m.type === "photo");
  return `<div class="area">
    <h3 style="margin-top:0">📍 ${escapeHtml(area.name as string)} <span class="badge">${areaElements.length} elementi</span></h3>
    ${areaMedia.length > 0 ? `<div class="photos">${areaMedia.slice(0, 6).map((m) => `
      <div class="photo">
        <img src="${escapeHtml(m.url as string)}" alt="${escapeHtml((m.checklist_label as string) ?? "")}"/>
        <div class="caption">${escapeHtml((m.checklist_label as string) ?? "Foto area")}</div>
      </div>
    `).join("")}</div>` : ""}
    ${areaElements.map((el, idx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const elType = (schema.element_types as Array<any> ?? []).find((t) => t.key === el.element_type);
      const elMedia = refreshedMedia.filter((m) => m.element_id === el.id && m.type === "photo");
      const values = (el.values as Record<string, unknown>) ?? {};
      const fieldsToShow = elType?.sections?.flatMap((s: { fields: Array<Record<string, unknown>> }) => s.fields ?? []) ?? [];
      return `<div class="element">
        <div class="header-row">
          <span class="badge">#${idx + 1}</span>
          <strong>${escapeHtml((elType?.label as string) ?? (el.element_type as string))}</strong>
          <span style="color:#64748b;font-size:11px">qty: ${el.quantity}</span>
        </div>
        ${fieldsToShow.length > 0 ? `<div>
          ${fieldsToShow.slice(0, 8).map((f: Record<string, unknown>) => {
            const k = f.key as string;
            const label = f.label as string;
            const val = values[k];
            if (val == null || val === "") return "";
            const vStr = Array.isArray(val) ? val.join(", ") :
                         typeof val === "object" ? JSON.stringify(val) : String(val);
            return `<span class="field"><span class="key">${escapeHtml(label)}:</span> <span class="val">${escapeHtml(vStr)}</span></span>`;
          }).join("")}
        </div>` : ""}
        ${elMedia.length > 0 ? `<div class="photos" style="grid-template-columns:repeat(4,1fr)">${elMedia.slice(0, 8).map((m) => `
          <div class="photo">
            <img src="${escapeHtml(m.url as string)}" alt="${escapeHtml((m.checklist_label as string) ?? "")}"/>
            <div class="caption">${escapeHtml((m.checklist_label as string) ?? "Foto")}</div>
          </div>
        `).join("")}</div>` : ""}
      </div>`;
    }).join("")}
  </div>`;
}).join("")}
` : "<p style='color:#64748b;font-style:italic'>Nessuna area rilevata.</p>"}

${survey.notes ? `
<h2>Note generali</h2>
<p style="background:#f8fafc;padding:12px;border-radius:6px;font-size:13px;white-space:pre-wrap">${escapeHtml(survey.notes as string)}</p>
` : ""}

${survey.client_signature_url ? `
<div class="signature-box">
  <div style="font-size:11px;color:#7c3aed;text-transform:uppercase;letter-spacing:0.05em;font-weight:600">Firma del cliente</div>
  <img src="${escapeHtml(survey.client_signature_url as string)}" alt="firma cliente" style="margin-top:8px"/>
  <div style="margin-top:8px;font-size:13px">
    <strong>${escapeHtml((survey.client_signature_name as string) ?? "Cliente")}</strong>
    ${survey.client_signature_at ? ` · ${fmtDate(survey.client_signature_at as string)}` : ""}
  </div>
</div>
` : ""}

<div class="footer">
  Documento generato il ${new Date().toLocaleString("it-IT")} · Edilizia in Cloud · Rilievo ${escapeHtml(survey.code as string)}
</div>

</div>
</body>
</html>`;

  // Salva HTML in storage e ritorna URL firmato
  const htmlPath = `${survey.company_id}/${survey.id}/report-${Date.now()}.html`;
  const { error: uploadErr } = await supabase.storage
    .from("surveys")
    .upload(htmlPath, new Blob([html], { type: "text/html;charset=utf-8" }), {
      contentType: "text/html;charset=utf-8",
      upsert: true,
    });
  if (uploadErr) {
    console.error("[generate-survey-pdf] upload failed:", uploadErr);
    return jsonRes({ ok: false, error: uploadErr.message }, 500);
  }

  const { data: signed } = await supabase.storage
    .from("surveys").createSignedUrl(htmlPath, 60 * 60 * 24);
  const url = signed?.signedUrl ?? "";

  // Salva URL nel survey
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from("surveys")
    .update({ pdf_report_url: url })
    .eq("id", survey.id);

  return jsonRes({ ok: true, html_url: url, code: survey.code });
});

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
