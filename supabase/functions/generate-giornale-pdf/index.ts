import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyCompanyAccess } from "../_shared/companyAuth.ts";
import { getCorsHeaders } from "../_shared/headers.ts";

function escHtml(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const parts = d.split("-");
  if (parts.length !== 3) return d;
  const [y, m, day] = parts;
  return `${day}/${m}/${y}`;
}

interface GiornaleEntry {
  id: string;
  data_lavori: string;
  condizioni_meteo: string | null;
  lavorazioni_eseguite: string | null;
  materiali_utilizzati: string | null;
  personale_presente: number | null;
  note: string | null;
  avanzamento_percentuale: number | null;
  temperatura: string | null;
  firmato_da: string | null;
  firmato_il: string | null;
  giornale_foto: { id: string; url: string }[];
}

interface Order {
  description: string;
  order_code: string | null;
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

const METEO_LABEL: Record<string, string> = {
  soleggiato: "☀️ Soleggiato",
  nuvoloso: "🌤 Nuvoloso",
  pioggia: "🌧 Pioggia",
  neve: "❄️ Neve",
  "vento forte": "💨 Vento forte",
};

function buildGiornaleHtml(
  entries: GiornaleEntry[],
  order: Order | null,
  azienda: Azienda,
  companyId: string,
): string {
  const colore = azienda.colore_primario || "#0ea5e9";
  const title = order
    ? `Giornale dei Lavori — ${order.order_code ? `#${escHtml(order.order_code)} ` : ""}${escHtml(order.description)}`
    : "Giornale dei Lavori";

  const entriesHtml = entries
    .map(
      (e, i) => `
    <div style="margin-bottom:24px;page-break-inside:avoid;">
      <!-- Entry header -->
      <div style="background:${i % 2 === 0 ? "#f8fafc" : "#fff"};border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;">
        <div style="background:${colore};color:white;padding:8px 12px;display:flex;justify-content:space-between;align-items:center;">
          <span style="font-weight:700;font-size:10pt;">${fmtDate(e.data_lavori)}</span>
          <span style="font-size:9pt;">${e.avanzamento_percentuale != null ? `Avanzamento: ${e.avanzamento_percentuale}%` : ""}</span>
        </div>
        <div style="padding:12px;">
          <!-- Meta row -->
          <div style="display:flex;flex-wrap:wrap;gap:16px;margin-bottom:10px;font-size:8.5pt;color:#475569;">
            ${e.condizioni_meteo ? `<span>${METEO_LABEL[e.condizioni_meteo] || escHtml(e.condizioni_meteo)}</span>` : ""}
            ${e.temperatura ? `<span>🌡 ${escHtml(e.temperatura)}</span>` : ""}
            ${e.personale_presente != null ? `<span>👷 ${e.personale_presente} operai</span>` : ""}
          </div>

          <!-- Lavorazioni -->
          ${
            e.lavorazioni_eseguite
              ? `<div style="margin-bottom:8px;">
            <div style="font-size:8pt;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;">Lavorazioni eseguite</div>
            <div style="font-size:9.5pt;color:#1e293b;white-space:pre-wrap;line-height:1.5;">${escHtml(e.lavorazioni_eseguite)}</div>
          </div>`
              : ""
          }

          <!-- Materiali -->
          ${
            e.materiali_utilizzati
              ? `<div style="margin-bottom:8px;">
            <div style="font-size:8pt;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;">Materiali utilizzati</div>
            <div style="font-size:9.5pt;color:#1e293b;white-space:pre-wrap;">${escHtml(e.materiali_utilizzati)}</div>
          </div>`
              : ""
          }

          <!-- Note -->
          ${
            e.note
              ? `<div style="margin-bottom:8px;">
            <div style="font-size:8pt;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;">Note</div>
            <div style="font-size:9pt;color:#475569;font-style:italic;white-space:pre-wrap;">${escHtml(e.note)}</div>
          </div>`
              : ""
          }

          <!-- Firma -->
          ${
            e.firmato_da
              ? `<div style="margin-top:8px;padding-top:8px;border-top:1px dashed #e2e8f0;font-size:8.5pt;color:#475569;">
            ✍️ Firmato da: <strong>${escHtml(e.firmato_da)}</strong>${e.firmato_il ? ` — ${fmtDate(e.firmato_il.split("T")[0])}` : ""}
          </div>`
              : ""
          }
        </div>
      </div>
    </div>
  `,
    )
    .join("");

  const indirizzo = [azienda.indirizzo, azienda.cap, azienda.citta]
    .filter(Boolean)
    .join(", ");

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escHtml(title)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
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
  <!-- Company header -->
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
        ? `<img src="${escHtml(azienda.logo_url)}" alt="Logo azienda" style="max-height:60px;max-width:180px;object-fit:contain;" />`
        : ""
    }
  </div>

  <!-- Document title -->
  <div style="text-align:center;margin-bottom:24px;">
    <div style="font-size:16pt;font-weight:700;color:#0f172a;letter-spacing:-0.5px;">GIORNALE DEI LAVORI</div>
    ${
      order
        ? `<div style="font-size:10pt;color:#475569;margin-top:4px;">${order.order_code ? `Cantiere #${escHtml(order.order_code)} — ` : ""}${escHtml(order.description)}</div>`
        : '<div style="font-size:10pt;color:#475569;margin-top:4px;">Tutti i cantieri</div>'
    }
    <div style="font-size:8pt;color:#94a3b8;margin-top:4px;">
      ${entries.length} ${entries.length === 1 ? "report" : "report"} —
      Generato il ${new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" })}
    </div>
  </div>

  <!-- Summary bar -->
  ${
    entries.length > 0
      ? `<div style="background:#f1f5f9;border-radius:6px;padding:10px 14px;margin-bottom:20px;display:flex;gap:24px;font-size:8.5pt;color:#475569;">
    <span>📅 Dal <strong>${fmtDate(entries[entries.length - 1].data_lavori)}</strong> al <strong>${fmtDate(entries[0].data_lavori)}</strong></span>
    <span>👷 Tot. operai: <strong>${entries.reduce((s, e) => s + (e.personale_presente ?? 0), 0)}</strong> giornate</span>
    ${entries[0].avanzamento_percentuale != null ? `<span>📊 Ultimo avanzamento: <strong>${entries[0].avanzamento_percentuale}%</strong></span>` : ""}
  </div>`
      : ""
  }

  <!-- Entries -->
  ${entriesHtml}

  ${
    entries.length === 0
      ? `<div style="text-align:center;padding:40px;color:#94a3b8;font-size:10pt;">Nessun report disponibile per i parametri selezionati.</div>`
      : ""
  }

  <!-- Footer -->
  <div style="margin-top:40px;padding-top:12px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:7pt;color:#94a3b8;">
    <div>${escHtml(azienda.ragione_sociale)} — P.IVA ${escHtml(azienda.partita_iva)}</div>
    <div style="color:${colore};">Edilizia in Cloud — www.ediliziaincloud.it</div>
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
    const { data: claims, error: authErr } = await supabase.auth.getClaims(token);
    if (authErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Non autorizzato" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }
    const userId = claims.claims.sub as string;

    const { company_id, order_id } = await req.json();
    if (!company_id) {
      return new Response(JSON.stringify({ error: "company_id obbligatorio" }), {
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

    // Fetch giornale entries
    let query = supabase
      .from("giornale_lavori")
      .select("id, data_lavori, condizioni_meteo, lavorazioni_eseguite, materiali_utilizzati, personale_presente, note, avanzamento_percentuale, temperatura, firmato_da, firmato_il, giornale_foto(id, url)")
      .eq("company_id", company_id)
      .order("data_lavori", { ascending: false });

    if (order_id) {
      query = query.eq("order_id", order_id);
    }

    const { data: entries, error: entriesErr } = await query;
    if (entriesErr) {
      return new Response(JSON.stringify({ error: "Errore nel caricamento dei dati" }), {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Fetch order info (if order_id provided)
    let order: Order | null = null;
    if (order_id) {
      const { data: orderData } = await supabase
        .from("orders")
        .select("description, order_code")
        .eq("id", order_id)
        .single();
      order = orderData;
    }

    // Fetch company info
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

    const safeEntries: GiornaleEntry[] = (entries || []).map((e: any) => ({
      ...e,
      giornale_foto: Array.isArray(e.giornale_foto) ? e.giornale_foto : [],
    }));

    const html = buildGiornaleHtml(safeEntries, order, azienda, company_id);

    // Build filename
    const today = new Date().toISOString().split("T")[0].replace(/-/g, "");
    const slug = order?.order_code || "tutti-cantieri";
    const filename = `giornale-lavori-${slug}-${today}.html`;

    return new Response(JSON.stringify({ html, filename }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-giornale-pdf error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
