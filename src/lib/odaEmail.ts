/**
 * Testo dell'email con cui si manda un Ordine d'Acquisto al fornitore.
 *
 * Non spedisce niente: prepara oggetto e corpo da mettere nel compositore
 * email dell'app (lo stesso di contatti, opportunità e commesse), così chi
 * ordina può cambiare le parole, allegare documenti e scegliere la casella
 * mittente prima di inviare.
 *
 * Il corpo è un frammento HTML — niente <html>/<body> — perché finisce
 * dentro l'editor rich, non in una pagina a sé.
 */
import { formatCurrency } from "@/lib/formatters";

export interface OdaEmailRiga {
  description: string;
  quantity: number | string;
  unit_of_measure?: string | null;
  unit_price: number | string;
  line_total: number | string;
  sku?: string | null;
}

export interface OdaEmailDati {
  odaNumber: string;
  fornitoreNome?: string | null;
  aziendaNome?: string | null;
  dataEmissione?: string | null;
  consegnaPrevista?: string | null;
  pagamento?: string | null;
  commessaCodice?: string | null;
  note?: string | null;
  subtotal: number;
  vatTotal: number;
  total: number;
  righe: OdaEmailRiga[];
}

/** Descrizioni e note sono testo libero dell'utente: qui diventano HTML. */
function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Stessa formattazione degli importi che si vede a schermo: formatCurrency
 *  forza il separatore delle migliaia, che il CLDR italiano omette sotto le
 *  cinque cifre ("2090,00 €" accanto a "19.764,00 €" sembrava un errore). */
const eur = (n: unknown) => formatCurrency(Number(n ?? 0));

/** Le date arrivano come "2026-05-10": in email vanno lette all'italiana. */
export function dataItaliana(iso?: string | null): string | null {
  if (!iso) return null;
  return String(iso).slice(0, 10).split("-").reverse().join("/");
}

export function buildOdaEmailSubject(d: OdaEmailDati): string {
  const consegna = dataItaliana(d.consegnaPrevista);
  const azienda = d.aziendaNome ? ` | ${d.aziendaNome}` : "";
  return `Ordine d'acquisto ${d.odaNumber}${consegna ? ` — consegna ${consegna}` : ""}${azienda}`;
}

export function buildOdaEmailBody(d: OdaEmailDati): string {
  const consegna = dataItaliana(d.consegnaPrevista);
  const emissione = dataItaliana(d.dataEmissione);

  const righe = d.righe.length
    ? d.righe
        .map(
          (r) => `<tr>
  <td style="padding:6px 8px;border-bottom:1px solid #eee;">${esc(r.description)}${
    r.sku ? ` <span style="color:#888;font-size:11px;">(cod. ${esc(r.sku)})</span>` : ""
  }</td>
  <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${Number(r.quantity).toLocaleString("it-IT")} ${esc(r.unit_of_measure || "pz")}</td>
  <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${eur(r.unit_price)}</td>
  <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${eur(r.line_total)}</td>
</tr>`,
        )
        .join("")
    : `<tr><td colspan="4" style="padding:10px 8px;color:#888;font-style:italic;">Nessun dettaglio articoli: fa fede l'importo complessivo.</td></tr>`;

  const condizioni = [
    consegna ? `<li>Consegna richiesta: <strong>${esc(consegna)}</strong></li>` : "",
    d.pagamento ? `<li>Pagamento: ${esc(d.pagamento)}</li>` : "",
    d.commessaCodice ? `<li>Riferimento cantiere: ${esc(d.commessaCodice)}</li>` : "",
  ]
    .filter(Boolean)
    .join("");

  return `<p>Spett.le <strong>${esc(d.fornitoreNome || "Fornitore")}</strong>,</p>
<p>con la presente Vi trasmettiamo il nostro ordine d'acquisto <strong>${esc(d.odaNumber)}</strong>${
    emissione ? ` del ${esc(emissione)}` : ""
  }.</p>
<table style="width:100%;border-collapse:collapse;font-size:13px;">
  <thead><tr style="background:#eef2f7;">
    <th style="padding:6px 8px;text-align:left;">Descrizione</th>
    <th style="padding:6px 8px;text-align:right;">Q.tà</th>
    <th style="padding:6px 8px;text-align:right;">Prezzo</th>
    <th style="padding:6px 8px;text-align:right;">Totale</th>
  </tr></thead>
  <tbody>${righe}</tbody>
  <tfoot>
    <tr><td colspan="3" style="padding:5px 8px;text-align:right;color:#555;">Imponibile</td><td style="padding:5px 8px;text-align:right;">${eur(d.subtotal)}</td></tr>
    <tr><td colspan="3" style="padding:5px 8px;text-align:right;color:#555;">IVA</td><td style="padding:5px 8px;text-align:right;">${eur(d.vatTotal)}</td></tr>
    <tr><td colspan="3" style="padding:7px 8px;text-align:right;"><strong>Totale ordine</strong></td><td style="padding:7px 8px;text-align:right;"><strong>${eur(d.total)}</strong></td></tr>
  </tfoot>
</table>
${condizioni ? `<ul style="font-size:13px;">${condizioni}</ul>` : ""}
${d.note ? `<p style="font-size:13px;"><strong>Note:</strong> ${esc(d.note)}</p>` : ""}
<p>Vi preghiamo di confermare ricezione e data di consegna rispondendo a questa email. Sul documento di trasporto Vi chiediamo di riportare il numero d'ordine <strong>${esc(d.odaNumber)}</strong>.</p>
<p>Cordiali saluti,<br>${esc(d.aziendaNome || "")}</p>`;
}
