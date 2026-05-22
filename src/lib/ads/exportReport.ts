/**
 * exportReport — export CSV/PDF dei dati performance Meta Ads.
 *
 * CSV: lista campagne con KPI aggregati
 * PDF: report sintetico con grafici (usa window.print() come fallback)
 */

import type { MetaInsightDay, MetaInsightsSummary } from "@/hooks/useMetaInsights";

interface ExportInput {
  campaignName: string;
  insights: MetaInsightDay[];
  summary: MetaInsightsSummary;
}

/**
 * Export CSV — ogni riga è un giorno di performance.
 * Apre il file scaricato in download nativo del browser.
 */
export function exportInsightsCsv(input: ExportInput) {
  const { campaignName, insights } = input;
  const headers = [
    "Data",
    "Spesa (€)",
    "Impressioni",
    "Click",
    "CTR %",
    "CPM (€)",
    "CPC (€)",
    "Lead",
    "CPL (€)",
    "Reach",
    "Frequency",
  ];

  const rows = insights.map((d) => [
    d.date_start,
    (d.spend_cents / 100).toFixed(2),
    String(d.impressions),
    String(d.clicks),
    (d.ctr * 100).toFixed(2),
    (d.cpm_cents / 100).toFixed(2),
    (d.cpc_cents / 100).toFixed(2),
    String(d.leads),
    (d.cost_per_lead_cents / 100).toFixed(2),
    String(d.reach),
    d.frequency.toFixed(2),
  ]);

  // Costruisci CSV
  const csvContent =
    [headers, ...rows]
      .map((row) =>
        row
          .map((cell) => {
            const s = String(cell);
            return s.includes(",") || s.includes('"') || s.includes("\n")
              ? `"${s.replace(/"/g, '""')}"`
              : s;
          })
          .join(","),
      )
      .join("\n");

  // BOM (U+FEFF) esplicito per Excel detect UTF-8
  const BOM = "\ufeff";
  const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `report-${campaignName.replace(/[^a-z0-9]/gi, "_")}-${
    new Date().toISOString().split("T")[0]
  }.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export "PDF" — usa window.print() su un layout printable.
 * Per PDF veri serve react-pdf o puppeteer (lato server).
 */
export function exportInsightsPrint(input: ExportInput) {
  const { campaignName, summary, insights } = input;

  const printWindow = window.open("", "_blank", "width=900,height=1200");
  if (!printWindow) {
    alert("Sblocca i popup per generare il report");
    return;
  }

  const formatEuro = (cents: number) =>
    new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(cents / 100);

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Report Meta Ads — ${campaignName}</title>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 32px; color: #1e293b; }
        h1 { font-size: 24px; margin-bottom: 4px; }
        .subtitle { color: #64748b; font-size: 14px; margin-bottom: 24px; }
        .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
        .kpi { padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc; }
        .kpi-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
        .kpi-value { font-size: 22px; font-weight: bold; color: #0f172a; margin-top: 4px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th, td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; text-align: left; }
        th { background: #f1f5f9; font-weight: 600; }
        td.right { text-align: right; }
        .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 11px; }
        @media print {
          body { padding: 16px; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <h1>${campaignName}</h1>
      <p class="subtitle">Report performance Meta Ads · ${new Date().toLocaleDateString("it-IT")}</p>

      <div class="kpi-grid">
        <div class="kpi">
          <div class="kpi-label">Spesa totale</div>
          <div class="kpi-value">${formatEuro(summary.total_spend_cents)}</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Lead</div>
          <div class="kpi-value">${summary.total_leads}</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">CPL medio</div>
          <div class="kpi-value">${
            summary.avg_cpl_cents ? formatEuro(summary.avg_cpl_cents) : "—"
          }</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Click</div>
          <div class="kpi-value">${summary.total_clicks.toLocaleString("it-IT")}</div>
        </div>
      </div>

      <h2 style="font-size:14px; margin-top:24px; margin-bottom:8px;">Dettaglio per giorno</h2>
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th class="right">Spesa</th>
            <th class="right">Impressioni</th>
            <th class="right">Click</th>
            <th class="right">Lead</th>
            <th class="right">CPL</th>
          </tr>
        </thead>
        <tbody>
          ${insights
            .map(
              (d) => `
            <tr>
              <td>${d.date_start}</td>
              <td class="right">${formatEuro(d.spend_cents)}</td>
              <td class="right">${d.impressions.toLocaleString("it-IT")}</td>
              <td class="right">${d.clicks}</td>
              <td class="right">${d.leads}</td>
              <td class="right">${d.leads > 0 ? formatEuro(d.spend_cents / d.leads) : "—"}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>

      <div class="footer">
        Generato da EdiliziaInCloud · Modulo Pubblicità · ${new Date().toISOString()}
      </div>

      <script>
        window.onload = () => {
          window.print();
        };
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
}
