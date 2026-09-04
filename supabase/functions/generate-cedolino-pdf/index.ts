import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";

const MESI = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

// Il calcolo CCNL non è più qui.
//
// Fino a oggi questo file conteneva una seconda copia delle aliquote e degli
// scaglioni IRPEF, usata per «riempire i vuoti» quando la riga in tabella non
// aveva importi: `cedolino.lordo ?? 0`. Con una riga vuota stampava un cedolino
// di zeri, contributi compresi, con l'aria di un documento vero.
//
// Due errori che quella copia si portava dietro, e che il calcolo sul server
// non ha:
//   • quattro scaglioni IRPEF (15k/28k/50k) etichettati «2024»: è lo schema
//     fino al 2023. Dal 2024 i primi due sono accorpati al 23% fino a 28.000.
//   • nella detrazione art. 13 TUIR fra 15.000 e 28.000 mancava il termine
//     + 1.190 × (28.000 − reddito) / 13.000.
//
// Ora i numeri arrivano da public.cedolino_per_stampa, che legge la riga se ha
// importi e altrimenti li ricalcola dalle timbrature — e se non può, lo dice.

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

  // Tutti i numeri vengono dal server: qui non si calcola nulla.
  const num = (v: unknown) => Number(v ?? 0);
  const lordo = num(cedolino.lordo);
  const contribDip = num(cedolino.contributi_dipendente);
  const contribDatore = num(cedolino.contributi_datore);
  const irpef = num(cedolino.ritenute_irpef);
  const netto = num(cedolino.netto);
  const costoAzienda = num(cedolino.costo_azienda);
  const cassaEdileDip = num(cedolino.cassa_edile_dipendente);
  const cassaEdileDat = num(cedolino.cassa_edile_datore);

  const statoLabel: Record<string, string> = { bozza: "Bozza", emesso: "Emesso", pagato: "Pagato" };
  const statoColor: Record<string, string> = { bozza: "#9ca3af", emesso: "#3b82f6", pagato: "#22c55e" };
  const stato = cedolino.stato ?? "bozza";

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8" />
  <title>Cedolino Paga — ${cedolino.employee_name} — ${periodoLabel}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @page { size: A4; margin: 12mm; }
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
    const { cedolino_id, company_id } = await req.json();
    if (!cedolino_id || !company_id) {
      return new Response(JSON.stringify({ error: "cedolino_id e company_id obbligatori" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // I numeri e il controllo di accesso stanno nella stessa chiamata: la RPC
    // gira con il JWT dell'utente, così vale il suo permesso e non quello del
    // service role. Un cedolino è un dato personale: un collega della stessa
    // azienda non deve poterlo leggere, e cedolino_per_stampa lo verifica.
    const supabaseUtente = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: cedolino, error: cedErr } = await supabaseUtente
      .rpc("cedolino_per_stampa", { p_cedolino_id: cedolino_id });

    if (cedErr) {
      const negato = cedErr.code === "42501" || /accesso negato/i.test(cedErr.message ?? "");
      return new Response(
        JSON.stringify({ error: negato ? "Non autorizzato: questo cedolino non è tuo" : cedErr.message }),
        { status: negato ? 403 : 500,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    // Non stampabile non vuol dire zero: vuol dire che manca qualcosa, e si dice cosa.
    if (!cedolino || cedolino.stampabile !== true) {
      return new Response(
        JSON.stringify({
          error: cedolino?.motivo ?? "Cedolino non trovato",
          stampabile: false,
        }),
        { status: cedolino?.motivo === "cedolino non trovato" ? 404 : 422,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    // Fetch azienda info
    const { data: azienda } = await supabase
      .from("anagrafica_azienda")
      .select("ragione_sociale, partita_iva, indirizzo, comune, cap")
      .eq("company_id", company_id)
      .maybeSingle();

    const meseLabel = MESI[(cedolino.mese ?? 1) - 1] ?? String(cedolino.mese);
    const html = buildHtml(cedolino, azienda);
    const filename = `cedolino_${String(cedolino.employee_name ?? "dipendente").replace(/\s+/g, "_")}_${meseLabel}_${cedolino.anno}.html`;

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
