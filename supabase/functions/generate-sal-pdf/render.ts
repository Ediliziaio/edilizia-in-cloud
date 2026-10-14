import {nettoSal} from "../_shared/salNetto.ts";
function escHtml(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const parts = d.split("T")[0].split("-");
  if (parts.length !== 3) return d;
  const [y, m, day] = parts;
  return `${day}/${m}/${y}`;
}

function fmtEur(n: number): string {
  return n.toLocaleString("it-IT", {style:"currency",currency:"EUR",useGrouping:true,minimumFractionDigits:2,maximumFractionDigits:2});
}

interface SalVoce {
  id: string;
  descrizione: string;
  importo_contrattuale: number;
  percentuale_avanzamento: number;
  importo_sal: number;
  note: string | null;
}

export interface SalRecord {
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
  indirizzo_lavori?:string|null;
  work_address?:string|null;
  customer?:{first_name:string|null;last_name:string|null;address:string|null}|null;
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
  firmato: "FIRMATO DAL CLIENTE",
};

export function buildSalHtml(sal: SalRecord, order: Order | null, azienda: Azienda, signatureUrl?: string | null, brandFooter?: string, previous=0): string {
  const colore = /^#[a-f0-9]{6}$/i.test(azienda.colore_primario??"") ? azienda.colore_primario! : "#0ea5e9";
  const voci: SalVoce[] = sal.sal_voci || [];
  if(!voci.length || voci.some(v=>!v.descrizione?.trim() || !Number.isFinite(Number(v.importo_sal)) || Number(v.importo_sal)<0 || !Number.isFinite(Number(v.importo_contrattuale)) || Number(v.importo_contrattuale)<0 || !Number.isFinite(Number(v.percentuale_avanzamento)) || Number(v.percentuale_avanzamento)<0 || Number(v.percentuale_avanzamento)>100 || Math.floor((Math.round(Number(v.importo_contrattuale)*100)*Math.round(Number(v.percentuale_avanzamento)*100)+5_000)/10_000)!==Math.round(Number(v.importo_sal)*100)))throw new Error("Voci SAL incomplete o non valide");
  if(!["bozza","emesso","approvato","firmato"].includes(sal.stato)||!Number.isInteger(sal.numero_sal)||sal.numero_sal<1)throw new Error("Stato o numerazione SAL non validi");
  const totaleContrattuale = voci.reduce((s, v) => s + Number(v.importo_contrattuale), 0);
  const totaleSal = Math.round(voci.reduce((s,v)=>s+Math.round(Number(v.importo_sal)*100),0))/100;
  if(!Number.isFinite(Number(sal.importo_totale)) || Math.abs(totaleSal-Number(sal.importo_totale))>0.01 || !Number.isFinite(previous))throw new Error("Totale SAL non coerente: verificare voci e storico");
  const economic=nettoSal(totaleSal,previous);
  const percMedia = totaleContrattuale > 0 ? (totaleSal / totaleContrattuale) * 100 : 0;

  const indirizzo = [azienda.indirizzo, azienda.cap, azienda.citta].filter(Boolean).join(", ");
  const cliente=[order?.customer?.first_name,order?.customer?.last_name].filter(Boolean).join(" ");
  const indirizzoCantiere=order?.indirizzo_lavori || order?.work_address;

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
    ["approvato","firmato"].includes(sal.stato) ? "#22c55e" : sal.stato === "emesso" ? colore : "#94a3b8";

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
    table {width:100%;table-layout:fixed;} td {overflow-wrap:anywhere;} thead {display:table-header-group;} tr {break-inside:avoid;}
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
          Commessa: ${order.order_code ? `#${escHtml(order.order_code)} — ` : ""}${escHtml(order.description)}
        </div>`
          : ""
      }
      ${cliente ? `<div style="font-size:9pt;color:#475569;margin-top:4px;">Committente: ${escHtml(cliente)}${order?.customer?.address ? ` — ${escHtml(order.customer.address)}` : ""}</div>` : ""}
      ${indirizzoCantiere ? `<div style="font-size:9pt;color:#475569;margin-top:4px;">Cantiere: ${escHtml(indirizzoCantiere)}</div>` : ""}
      <div style="font-size:8pt;color:#94a3b8;margin-top:2px;">Data emissione: ${fmtDate(sal.data_emissione)}</div>
    </div>
    <div style="text-align:right;">
      <div style="display:inline-block;background:${statoColor};color:white;font-size:8pt;font-weight:700;padding:4px 10px;border-radius:4px;letter-spacing:0.5px;">${statoLabel}</div>
    </div>
  </div>

  <!-- Summary cards -->
  <div style="display:flex;gap:12px;margin-bottom:20px;">
    <div style="flex:1;border:1px solid #e2e8f0;border-radius:6px;padding:10px 12px;">
      <div style="font-size:7.5pt;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;">Valore delle voci</div>
      <div style="font-size:13pt;font-weight:700;color:#0f172a;">${fmtEur(totaleContrattuale)}</div>
    </div>
    <div style="flex:1;border:1px solid #e2e8f0;border-radius:6px;padding:10px 12px;">
      <div style="font-size:7.5pt;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;">Avanzamento economico</div>
      <div style="font-size:13pt;font-weight:700;color:${colore};">${percMedia.toFixed(1)}%</div>
    </div>
    <div style="flex:1;border:1px solid ${colore};border-radius:6px;padding:10px 12px;background:${colore}10;">
      <div style="font-size:7.5pt;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;">Cumulativo netto</div>
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

  <div style="border:1px solid #e2e8f0;border-radius:6px;padding:12px;margin:0 0 20px;font-size:9pt;">
    <div>Avanzamento cumulativo netto: <strong>${fmtEur(economic.totale)}</strong></div>
    <div>Ultimo cumulativo precedente: <strong>${fmtEur(economic.precedente)}</strong></div>
    <div style="margin-top:8px;font-size:11pt;">${economic.daFatturare<0 ? "Rettifica da verificare" : "Quota nuova di questo SAL"}: <strong>${fmtEur(economic.daFatturare)}</strong></div>
    <p style="margin-top:8px;color:#64748b;">Importi IVA esclusa. Questo documento non è una fattura e non attesta un pagamento. Acconti e fatture già emesse devono essere verificati prima della fatturazione.</p>
    ${sal.stato === "bozza" ? '<p style="margin-top:8px;color:#b45309;font-weight:bold;">BOZZA - Non emessa. Nessun link di approvazione attivo.</p>' : ""}
  </div>
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
        Approvazione cliente: <a href="${escHtml(signatureUrl)}" style="color:#3b82f6;overflow-wrap:anywhere;">${escHtml(signatureUrl)}</a>
      </div>
      <div style="margin-top:4px;font-size:7pt;color:#94a3b8;">Valido 7 giorni dalla generazione</div>
      ` : `<div style="margin-top:32px;font-size:7.5pt;color:#94a3b8;">Firma e timbro</div>`}
    </div>
  </div>

  <!-- Footer -->
  <div style="margin-top:40px;padding-top:10px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:7pt;color:#94a3b8;">
    <div>${escHtml(azienda.ragione_sociale)} — P.IVA ${escHtml(azienda.partita_iva)}</div>
    <div style="color:${colore};">${escHtml(brandFooter) || "Edilizia in Cloud"}</div>
  </div>

</div>
</body>
</html>`;
}
