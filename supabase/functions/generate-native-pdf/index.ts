import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyCompanyAccess } from "../_shared/companyAuth.ts";

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

interface Riga {
  descrizione?: string;
  codice_articolo?: string;
  note_riga?: string;
  quantita: number;
  unita_misura?: string;
  prezzo_unitario: number;
  sconto_percentuale?: number;
  aliquota_iva: string;
  natura_iva?: string;
  totale_riga: number;
  imponibile: number;
  imposta: number;
}

interface Riepilogo {
  aliquota: string;
  natura?: string;
  imponibile: number;
  imposta: number;
}

function buildNativeHtml(doc: Record<string, any>, azienda: Record<string, any>): string {
  const righe: Riga[] = doc.righe || [];
  const riepilogo: Riepilogo[] = doc.riepilogo_iva || [];
  const snap = doc.cliente_snapshot || {};
  const scadenze: any[] = doc.scadenze_pagamento || [];
  const hasSconto = righe.some((r) => (r.sconto_percentuale ?? 0) > 0);
  const colore = azienda.colore_primario || "#0ea5e9";

  const tipoLabels: Record<string, string> = {
    fattura: "FATTURA", fattura_pa: "FATTURA PA", nota_credito: "NOTA DI CREDITO",
    nota_debito: "NOTA DI DEBITO", autofattura: "AUTOFATTURA", proforma: "PROFORMA",
    preventivo: "PREVENTIVO", ddt: "DOCUMENTO DI TRASPORTO",
    fattura_riepilogativa: "FATTURA RIEPILOGATIVA",
    parcella: "PARCELLA", fattura_accompagnatoria: "FATTURA ACCOMPAGNATORIA",
  };
  const docLabel = tipoLabels[doc.tipo] || "DOCUMENTO";

  const righeHtml = righe.map((r, i) => `
    <tr style="background:${i % 2 === 1 ? '#f8fafc' : 'white'};border-bottom:1px solid #f1f5f9;">
      <td style="padding:6px 8px;color:#94a3b8;">${i + 1}</td>
      <td style="padding:6px 8px;">
        ${escHtml(r.descrizione) || "—"}
        ${r.codice_articolo ? `<div style="font-size:7pt;color:#94a3b8;">Cod: ${escHtml(r.codice_articolo)}</div>` : ""}
        ${r.note_riga ? `<div style="font-size:7pt;color:#94a3b8;font-style:italic;">${escHtml(r.note_riga)}</div>` : ""}
      </td>
      <td style="padding:6px 8px;text-align:right;">${r.quantita}</td>
      <td style="padding:6px 8px;text-align:center;">${escHtml(r.unita_misura)}</td>
      <td style="padding:6px 8px;text-align:right;">${fmtEur(r.prezzo_unitario)}</td>
      ${hasSconto ? `<td style="padding:6px 8px;text-align:right;">${r.sconto_percentuale ? r.sconto_percentuale + '%' : ''}</td>` : ''}
      <td style="padding:6px 8px;text-align:center;">${r.aliquota_iva}%${r.natura_iva ? ` (${escHtml(r.natura_iva)})` : ''}</td>
      <td style="padding:6px 8px;text-align:right;font-weight:600;">${fmtEur(r.totale_riga)}</td>
    </tr>
  `).join("");

  const riepilogoHtml = riepilogo.map(r => `
    <tr style="border-bottom:1px solid #f1f5f9;">
      <td style="padding:4px 8px;">${r.aliquota}%${r.natura ? ` (${escHtml(r.natura)})` : ''}</td>
      <td style="padding:4px 8px;text-align:right;">${fmtEur(r.imponibile)}</td>
      <td style="padding:4px 8px;text-align:right;">${fmtEur(r.imposta)}</td>
    </tr>
  `).join("");

  const scadenzeHtml = scadenze.map(sc => `
    <div>Rata ${sc.numero_rata}: ${fmtDate(sc.data_scadenza)} — ${fmtEur(sc.importo)}${sc.pagato ? ' ✓' : ''}</div>
  `).join("");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  @page { size: A4; margin: 15mm; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 9pt; color: #1a1a1a; line-height: 1.5; margin: 0; padding: 15mm; }
  .header { display: flex; justify-content: space-between; margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; }
  thead th { background: #f1f5f9; padding: 8px; font-size: 7pt; text-transform: uppercase; color: #475569; letter-spacing: 0.5px; text-align: left; }
</style>
</head><body>
<div class="header">
  <div style="max-width:55%;">
    ${azienda.logo_url ? `<img src="${escHtml(azienda.logo_url)}" style="height:40px;margin-bottom:8px;" />` : ''}
    <div style="font-size:14pt;font-weight:700;">${escHtml(azienda.ragione_sociale)}</div>
    ${azienda.forma_giuridica ? `<div style="font-size:8pt;color:#64748b;">${escHtml(azienda.forma_giuridica)}</div>` : ''}
    <div style="font-size:8pt;color:#64748b;margin-top:4px;">
      <div>${escHtml(azienda.indirizzo_via)}${azienda.indirizzo_numero_civico ? `, ${escHtml(azienda.indirizzo_numero_civico)}` : ''}</div>
      <div>${escHtml(azienda.indirizzo_cap)} ${escHtml(azienda.indirizzo_comune)} (${escHtml(azienda.indirizzo_provincia)})</div>
      <div style="font-family:monospace;">P.IVA: ${escHtml(azienda.partita_iva)}</div>
      ${azienda.codice_fiscale !== azienda.partita_iva ? `<div style="font-family:monospace;">C.F.: ${escHtml(azienda.codice_fiscale)}</div>` : ''}
      ${azienda.pec ? `<div>PEC: ${escHtml(azienda.pec)}</div>` : ''}
      ${azienda.telefono ? `<div>Tel: ${escHtml(azienda.telefono)}</div>` : ''}
    </div>
  </div>
  <div style="text-align:right;">
    <div style="display:inline-block;padding:6px 16px;border-radius:4px;background:${colore};color:white;font-size:14pt;font-weight:700;letter-spacing:1px;">${docLabel}</div>
    <div style="font-family:monospace;font-size:13pt;font-weight:600;margin-top:8px;">N° ${escHtml(doc.numero) || 'BOZZA'}</div>
    <div style="font-size:8pt;color:#64748b;margin-top:6px;">
      <div>Data: ${fmtDate(doc.data_emissione)}</div>
      ${doc.data_scadenza ? `<div>Scadenza: ${fmtDate(doc.data_scadenza)}</div>` : ''}
    </div>
  </div>
</div>

${snap.ragione_sociale ? `
<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px 16px;max-width:55%;margin-bottom:20px;">
  <div style="font-size:7pt;text-transform:uppercase;color:#94a3b8;letter-spacing:1px;margin-bottom:4px;">Destinatario</div>
  <div style="font-weight:600;font-size:11pt;">${escHtml(snap.ragione_sociale)}</div>
  ${snap.indirizzo_via ? `<div style="font-size:8pt;color:#64748b;">${escHtml(snap.indirizzo_via)}, ${escHtml(snap.indirizzo_cap)} ${escHtml(snap.indirizzo_comune)}${snap.indirizzo_provincia ? ` (${escHtml(snap.indirizzo_provincia)})` : ''}</div>` : ''}
  ${snap.partita_iva ? `<div style="font-size:8pt;color:#64748b;font-family:monospace;">P.IVA: ${escHtml(snap.partita_iva)}</div>` : ''}
  ${snap.codice_fiscale ? `<div style="font-size:8pt;color:#64748b;font-family:monospace;">C.F.: ${escHtml(snap.codice_fiscale)}</div>` : ''}
  <div style="font-size:8pt;color:#64748b;">
    ${snap.codice_sdi ? `<span>SDI: ${escHtml(snap.codice_sdi)}  </span>` : ''}
    ${snap.pec ? `<span>PEC: ${escHtml(snap.pec)}</span>` : ''}
  </div>
</div>` : ''}

${doc.cig || doc.cup ? `
<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:4px;padding:8px 12px;margin-bottom:16px;font-size:8pt;color:#1e40af;">
  ${doc.cig ? `<span>CIG: ${escHtml(doc.cig)}  </span>` : ''}
  ${doc.cup ? `<span>CUP: ${escHtml(doc.cup)}</span>` : ''}
</div>` : ''}

${righe.length > 0 ? `
<table style="margin-bottom:16px;font-size:8pt;">
  <thead>
    <tr>
      <th style="text-align:left;">#</th>
      <th style="text-align:left;">Descrizione</th>
      <th style="text-align:right;">Q.tà</th>
      <th style="text-align:center;">U.M.</th>
      <th style="text-align:right;">Prezzo</th>
      ${hasSconto ? '<th style="text-align:right;">Sc.%</th>' : ''}
      <th style="text-align:center;">IVA</th>
      <th style="text-align:right;">Importo</th>
    </tr>
  </thead>
  <tbody>${righeHtml}</tbody>
</table>` : ''}

<div style="display:flex;justify-content:space-between;gap:24px;margin-top:8px;">
  ${riepilogo.length > 0 ? `
  <div style="flex:1;">
    <div style="font-size:7pt;text-transform:uppercase;color:#94a3b8;letter-spacing:1px;margin-bottom:4px;">Riepilogo IVA</div>
    <table style="font-size:8pt;">
      <thead><tr style="border-bottom:1px solid #e2e8f0;">
        <th style="padding:4px 8px;text-align:left;font-size:7pt;color:#475569;">Aliquota</th>
        <th style="padding:4px 8px;text-align:right;font-size:7pt;color:#475569;">Imponibile</th>
        <th style="padding:4px 8px;text-align:right;font-size:7pt;color:#475569;">Imposta</th>
      </tr></thead>
      <tbody>${riepilogoHtml}</tbody>
    </table>
  </div>` : ''}
  
  <div style="min-width:240px;">
    <table style="font-size:8pt;width:100%;">
      <tr><td style="padding:4px 8px;color:#64748b;">Imponibile</td><td style="padding:4px 8px;text-align:right;">${fmtEur(doc.imponibile_totale || 0)}</td></tr>
      ${(doc.sconto_globale_valore || 0) > 0 ? `<tr><td style="padding:4px 8px;color:#dc2626;">Sconto</td><td style="padding:4px 8px;text-align:right;color:#dc2626;">-${fmtEur(doc.sconto_globale_valore)}</td></tr>` : ''}
      ${(doc.cassa_importo || 0) > 0 ? `<tr><td style="padding:4px 8px;color:#64748b;">Cassa prev.</td><td style="padding:4px 8px;text-align:right;">+${fmtEur(doc.cassa_importo)}</td></tr>` : ''}
      <tr><td style="padding:4px 8px;color:#64748b;">IVA</td><td style="padding:4px 8px;text-align:right;">${fmtEur(doc.iva_totale || 0)}</td></tr>
      ${doc.bollo_virtuale ? `<tr><td style="padding:4px 8px;color:#64748b;">Bollo</td><td style="padding:4px 8px;text-align:right;">${fmtEur(doc.bollo_importo || 2)}</td></tr>` : ''}
      <tr style="border-top:2px solid #0f172a;">
        <td style="padding:6px 8px;font-weight:700;font-size:12pt;color:${colore};">TOTALE</td>
        <td style="padding:6px 8px;text-align:right;font-weight:700;font-size:12pt;color:${colore};">${fmtEur(doc.totale_documento || 0)}</td>
      </tr>
      ${(doc.ritenuta_importo || 0) > 0 ? `
      <tr><td style="padding:4px 8px;color:#dc2626;">Ritenuta</td><td style="padding:4px 8px;text-align:right;color:#dc2626;">-${fmtEur(doc.ritenuta_importo)}</td></tr>
      <tr style="border-top:1px solid #e2e8f0;">
        <td style="padding:6px 8px;font-weight:700;font-size:10pt;color:${colore};">Netto a pagare</td>
        <td style="padding:6px 8px;text-align:right;font-weight:700;font-size:10pt;color:${colore};">${fmtEur(doc.totale_da_pagare || 0)}</td>
      </tr>` : ''}
    </table>
  </div>
</div>

${doc.metodo_pagamento_codice ? `
<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;padding:12px 16px;margin-top:20px;font-size:8pt;color:#475569;">
  <div style="font-weight:600;color:#1a1a1a;margin-bottom:4px;">Modalità di pagamento</div>
  <div>${escHtml(doc.metodo_pagamento_codice)} — ${escHtml(doc.metodo_pagamento_nome) || 'Bonifico'}</div>
  ${doc.iban_pagamento ? `<div style="font-family:monospace;">IBAN: ${escHtml(doc.iban_pagamento)}</div>` : ''}
  ${doc.intestatario_conto ? `<div>Intestatario: ${escHtml(doc.intestatario_conto)}</div>` : ''}
  ${doc.nome_banca ? `<div>Banca: ${escHtml(doc.nome_banca)}</div>` : ''}
  ${scadenze.length > 0 ? `<div style="margin-top:8px;"><div style="font-weight:600;color:#1a1a1a;margin-bottom:2px;">Scadenze</div>${scadenzeHtml}</div>` : ''}
</div>` : ''}

${doc.note_documento ? `
<div style="margin-top:16px;font-size:8pt;color:#475569;border-top:1px solid #e2e8f0;padding-top:8px;">
  <div style="font-weight:600;color:#1a1a1a;margin-bottom:2px;">Note</div>
  <div style="white-space:pre-wrap;">${escHtml(doc.note_documento)}</div>
</div>` : ''}

${azienda.regime_fiscale === 'RF19' ? `
<div style="margin-top:12px;font-size:7pt;color:#94a3b8;font-style:italic;">
  Operazione effettuata ai sensi dell'art. 1, commi da 54 a 89, L. n. 190/2014. Non soggetta a ritenuta d'acconto ai sensi del comma 67, L. n. 190/2014.
</div>` : ''}

<div style="margin-top:40px;padding-top:12px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:7pt;color:#94a3b8;">
  <div>${escHtml(azienda.ragione_sociale)} — P.IVA ${escHtml(azienda.partita_iva)}</div>
  <div style="color:${colore};">Documento generato da Edilizia in Cloud</div>
</div>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Non autorizzato" }), { status: 401, headers: corsHeaders });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: authErr } = await supabase.auth.getClaims(token);
    if (authErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Non autorizzato" }), { status: 401, headers: corsHeaders });
    }
    const userId = claims.claims.sub as string;

    const { documento_id, upload } = await req.json();
    if (!documento_id) {
      return new Response(JSON.stringify({ error: "documento_id obbligatorio" }), { status: 400, headers: corsHeaders });
    }

    // Load document
    const { data: doc, error: docErr } = await supabase
      .from("documenti_fiscali")
      .select("*")
      .eq("id", documento_id)
      .single();

    if (docErr || !doc) {
      return new Response(JSON.stringify({ error: "Documento non trovato" }), { status: 404, headers: corsHeaders });
    }

    // Verify user belongs to this company
    try {
      await verifyCompanyAccess(supabase, userId, doc.company_id);
    } catch {
      return new Response(JSON.stringify({ error: "Non autorizzato: accesso negato a questo documento" }), { status: 403, headers: corsHeaders });
    }

    // Load azienda
    const { data: azienda } = await supabase
      .from("anagrafica_azienda")
      .select("*")
      .eq("company_id", doc.company_id)
      .single();

    if (!azienda) {
      return new Response(JSON.stringify({ error: "Anagrafica azienda non configurata" }), { status: 400, headers: corsHeaders });
    }

    const html = buildNativeHtml(doc, azienda);

    // Upload if requested
    if (upload) {
      const filePath = `${doc.company_id}/${doc.id}/fattura.html`;
      const { error: uploadErr } = await supabase.storage
        .from("documenti-fiscali")
        .upload(filePath, new Blob([html], { type: "text/html" }), { upsert: true });

      if (uploadErr) {
        console.error("Upload error:", uploadErr);
      }

      // Update pdf_url
      await supabase
        .from("documenti_fiscali")
        .update({ pdf_url: filePath })
        .eq("id", doc.id);

      return new Response(JSON.stringify({ html, pdf_url: filePath }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ html }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-native-pdf error:", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
