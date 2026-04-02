import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyCompanyAccess } from "../_shared/companyAuth.ts";
import { getCorsHeaders } from "../_shared/headers.ts";

const MESI = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

/**
 * Calcola contributi CCNL Edilizia Industria — Aliquote 2024
 */
function calcolaContributiCCNLEdilizia(lordo: number) {
  // INPS
  const INPS_DIP = 0.0919;    // 9.19% — quota IVS dipendente
  const INPS_DAT = 0.2870;    // 28.70% — quota IVS datore
  // INAIL (media settore edile)
  const INAIL_DAT = 0.0380;   // 3.80%
  // Cassa Edile
  const CE_DIP = 0.0040;      // 0.40% Cassa Edile dipendente
  const CE_DAT = 0.0165;      // 1.65% Cassa Edile datore
  // Previdenza complementare Cometa
  const COMETA_DAT = 0.0020;  // 0.20%

  const contribDipendente = lordo * (INPS_DIP + CE_DIP);
  const contribDatore = lordo * (INPS_DAT + INAIL_DAT + CE_DAT + COMETA_DAT);
  const cassaEdileDip = lordo * CE_DIP;
  const cassaEdileDat = lordo * CE_DAT;

  // Calcolo IRPEF — scaglioni 2024 (annualizzato ÷ 12 × 12 = lordo annuo ≈ lordo mensile × 12)
  const imponibile = lordo - contribDipendente;
  const imponibileAnnuo = imponibile * 12;

  let irpefAnnua = 0;
  if (imponibileAnnuo <= 15000) irpefAnnua = imponibileAnnuo * 0.23;
  else if (imponibileAnnuo <= 28000) irpefAnnua = 3450 + (imponibileAnnuo - 15000) * 0.25;
  else if (imponibileAnnuo <= 50000) irpefAnnua = 6700 + (imponibileAnnuo - 28000) * 0.35;
  else irpefAnnua = 14400 + (imponibileAnnuo - 50000) * 0.43;

  // Detrazione lavoro dipendente (art. 13 TUIR 2024) su base annua
  let detrazioneAnnua = 0;
  if (imponibileAnnuo <= 15000) detrazioneAnnua = 1955;
  else if (imponibileAnnuo <= 28000) detrazioneAnnua = 1910;
  else if (imponibileAnnuo <= 50000) detrazioneAnnua = 1910 * ((50000 - imponibileAnnuo) / 22000);

  const irpefNetta = Math.max(0, (irpefAnnua - detrazioneAnnua) / 12);
  const netto = lordo - contribDipendente - irpefNetta;
  const costoAzienda = lordo + contribDatore;

  return { contribDipendente, contribDatore, cassaEdileDip, cassaEdileDat, irpefNetta, netto, costoAzienda };
}

function fmtEur(n: number | null | undefined): string {
  if (n === null || n === undefined) return "€ 0,00";
  return `€ ${n.toFixed(2).replace(".", ",")}`;
}

function buildHtml(cedolino: any, azienda: any): string {
  const meseLabel = MESI[(cedolino.mese ?? 1) - 1] ?? String(cedolino.mese);
  const periodoLabel = `${meseLabel} ${cedolino.anno}`;
  const ragioneSociale = azienda?.ragione_sociale ?? "Azienda";
  const pivaAzienda = azienda?.partita_iva ?? "";
  const indirizzoAzienda = [azienda?.indirizzo, azienda?.comune, azienda?.cap]
    .filter(Boolean)
    .join(", ");

  const lordo = cedolino.lordo ?? 0;
  // Usa CCNL Edilizia se i contributi non sono già calcolati nel DB
  const ccnl = calcolaContributiCCNLEdilizia(lordo);
  const contribDip = cedolino.contributi_dipendente ?? ccnl.contribDipendente;
  const contribDatore = cedolino.contributi_datore ?? ccnl.contribDatore;
  const irpef = cedolino.ritenute_irpef ?? ccnl.irpefNetta;
  const netto = cedolino.netto ?? ccnl.netto;
  const costoAzienda = lordo + contribDatore;
  const cassaEdileDip = ccnl.cassaEdileDip;
  const cassaEdileDat = ccnl.cassaEdileDat;

  const statoLabel: Record<string, string> = { bozza: "Bozza", emesso: "Emesso", pagato: "Pagato" };
  const statoColor: Record<string, string> = { bozza: "#9ca3af", emesso: "#3b82f6", pagato: "#22c55e" };
  const stato = cedolino.stato ?? "bozza";

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8" />
  <title>Cedolino Paga — ${cedolino.employee_name} — ${periodoLabel}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #111; background: #fff; padding: 20px; }
    .page { max-width: 800px; margin: 0 auto; }
    /* Header */
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #f97316; padding-bottom: 12px; margin-bottom: 16px; }
    .company-name { font-size: 18px; font-weight: bold; color: #f97316; }
    .company-meta { font-size: 11px; color: #555; margin-top: 3px; }
    .badge-stato { padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: bold; color: #fff; }
    /* Title row */
    .title-row { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; }
    .title-main { font-size: 15px; font-weight: bold; color: #ea580c; }
    .title-sub { font-size: 12px; color: #555; margin-top: 2px; }
    /* Summary cards */
    .cards { display: flex; gap: 10px; margin-bottom: 16px; }
    .card { flex: 1; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px; }
    .card-label { font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }
    .card-value { font-size: 16px; font-weight: bold; color: #111; margin-top: 3px; }
    .card-value.green { color: #16a34a; }
    .card-value.blue { color: #2563eb; }
    .card-value.orange { color: #ea580c; }
    /* Detail table */
    .section-title { font-size: 11px; font-weight: bold; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; margin-top: 14px; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #f9fafb; text-align: left; font-size: 10px; color: #6b7280; padding: 6px 10px; border-bottom: 1px solid #e5e7eb; }
    td { padding: 7px 10px; border-bottom: 1px solid #f3f4f6; font-size: 12px; }
    tr:last-child td { border-bottom: none; }
    .right { text-align: right; }
    .negative { color: #dc2626; }
    .total-row td { font-weight: bold; background: #f0fdf4; border-top: 2px solid #bbf7d0; }
    /* Notes */
    .notes { margin-top: 14px; padding: 10px 14px; background: #f9fafb; border-radius: 8px; font-size: 11px; color: #555; }
    /* Footer */
    .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: flex-end; }
    .signature-box { border-top: 1px solid #9ca3af; width: 200px; text-align: center; padding-top: 4px; font-size: 10px; color: #9ca3af; }
    .print-date { font-size: 10px; color: #9ca3af; }
    @media print { body { padding: 10px; } .page { max-width: 100%; } }
  </style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="header">
    <div>
      <div class="company-name">${ragioneSociale}</div>
      <div class="company-meta">${pivaAzienda ? `P.IVA: ${pivaAzienda}` : ""}${indirizzoAzienda ? ` &mdash; ${indirizzoAzienda}` : ""}</div>
    </div>
    <div>
      <span class="badge-stato" style="background:${statoColor[stato] ?? "#9ca3af"}">${statoLabel[stato] ?? stato}</span>
    </div>
  </div>

  <!-- Title -->
  <div class="title-row">
    <div>
      <div class="title-main">Cedolino Paga — ${periodoLabel}</div>
      <div class="title-sub">Dipendente: <strong>${cedolino.employee_name}</strong></div>
    </div>
    <div style="font-size:11px;color:#9ca3af;">ID: ${cedolino.id?.substring(0, 8) ?? "—"}</div>
  </div>

  <!-- Summary cards -->
  <div class="cards">
    <div class="card">
      <div class="card-label">Lordo</div>
      <div class="card-value orange">${fmtEur(lordo)}</div>
    </div>
    <div class="card">
      <div class="card-label">Netto da pagare</div>
      <div class="card-value green">${fmtEur(netto)}</div>
    </div>
    <div class="card">
      <div class="card-label">Costo azienda</div>
      <div class="card-value blue">${fmtEur(costoAzienda)}</div>
    </div>
  </div>

  <!-- Detail table -->
  <div class="section-title">Dettaglio competenze e trattenute</div>
  <table>
    <thead>
      <tr>
        <th>Voce</th>
        <th class="right">Importo</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Retribuzione lorda</td>
        <td class="right">${fmtEur(lordo)}</td>
      </tr>
      <tr>
        <td class="negative">(-) Contributi INPS dipendente (9.19%)</td>
        <td class="right negative">− ${fmtEur(contribDip - cassaEdileDip)}</td>
      </tr>
      <tr>
        <td class="negative">(-) Cassa Edile dipendente (0.40%)</td>
        <td class="right negative">− ${fmtEur(cassaEdileDip)}</td>
      </tr>
      <tr>
        <td class="negative">(-) Ritenute IRPEF</td>
        <td class="right negative">− ${fmtEur(irpef)}</td>
      </tr>
      <tr class="total-row">
        <td>= Netto da pagare</td>
        <td class="right">${fmtEur(netto)}</td>
      </tr>
    </tbody>
  </table>

  <div class="section-title" style="margin-top:16px;">Costo complessivo azienda</div>
  <table>
    <thead>
      <tr>
        <th>Voce</th>
        <th class="right">Importo</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Retribuzione lorda</td>
        <td class="right">${fmtEur(lordo)}</td>
      </tr>
      <tr>
        <td>Contributi INPS + INAIL datore (32.50%)</td>
        <td class="right">${fmtEur(contribDatore - cassaEdileDat)}</td>
      </tr>
      <tr>
        <td>Cassa Edile + Cometa datore (1.85%)</td>
        <td class="right">${fmtEur(cassaEdileDat)}</td>
      </tr>
      <tr class="total-row">
        <td>= Costo totale azienda</td>
        <td class="right">${fmtEur(costoAzienda)}</td>
      </tr>
    </tbody>
  </table>

  ${cedolino.note ? `
  <div class="notes"><strong>Note:</strong> ${cedolino.note}</div>
  ` : ""}

  <!-- Footer signatures -->
  <div class="footer">
    <div>
      <div class="signature-box">Firma Datore di Lavoro</div>
    </div>
    <div>
      <div class="signature-box">Firma Dipendente</div>
    </div>
    <div class="print-date">Stampato il ${new Date().toLocaleDateString("it-IT")}</div>
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

    const { cedolino_id, company_id } = await req.json();
    if (!cedolino_id || !company_id) {
      return new Response(JSON.stringify({ error: "cedolino_id e company_id obbligatori" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    try {
      await verifyCompanyAccess(supabase, userId, company_id);
    } catch {
      return new Response(JSON.stringify({ error: "Non autorizzato" }), {
        status: 403,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Fetch cedolino
    const { data: cedolino, error: cedErr } = await supabase
      .from("cedolini")
      .select("*")
      .eq("id", cedolino_id)
      .eq("company_id", company_id)
      .single();

    if (cedErr || !cedolino) {
      return new Response(JSON.stringify({ error: "Cedolino non trovato" }), {
        status: 404,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Fetch azienda info
    const { data: azienda } = await supabase
      .from("anagrafica_azienda")
      .select("ragione_sociale, partita_iva, indirizzo, comune, cap")
      .eq("company_id", company_id)
      .maybeSingle();

    const meseLabel = MESI[(cedolino.mese ?? 1) - 1] ?? String(cedolino.mese);
    const html = buildHtml(cedolino, azienda);
    const filename = `cedolino_${cedolino.employee_name.replace(/\s+/g, "_")}_${meseLabel}_${cedolino.anno}.html`;

    return new Response(JSON.stringify({ html, filename }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-cedolino-pdf error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
