import { Branding, RenderedTemplate, escapeHtml, formatEuro, formatDateIt } from "./types.ts";
import { renderLayout, renderButton, plainTextFooter } from "./layout.ts";

export interface InvoiceSentProps {
  recipientName: string;
  /** Numero fattura (es. "2026/001"). */
  invoiceNumber: string;
  /** Importo totale in centesimi di euro. */
  totalCents: number;
  /** Data emissione ISO. */
  issueDate: string;
  /** Data scadenza ISO. */
  dueDate?: string;
  /** URL per visualizzare/scaricare la fattura. */
  invoiceUrl: string;
  /** Numero ordine collegato (opzionale). */
  orderNumber?: string;
}

export function render(props: InvoiceSentProps, branding: Branding): RenderedTemplate {
  const preheader = `Fattura ${props.invoiceNumber} — ${formatEuro(props.totalCents)}`;

  const dueRow = props.dueDate
    ? `<tr><td style="padding:4px 0;color:#666666;">Scadenza:</td><td style="padding:4px 0;text-align:right;font-weight:600;">${formatDateIt(props.dueDate)}</td></tr>`
    : "";
  const orderRow = props.orderNumber
    ? `<tr><td style="padding:4px 0;color:#666666;">Ordine collegato:</td><td style="padding:4px 0;text-align:right;font-weight:600;">#${escapeHtml(props.orderNumber)}</td></tr>`
    : "";

  const innerBody = `
    <h1 class="h-title" style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:32px;font-weight:700;color:#1a1a1a;">
      Nuova fattura
    </h1>
    <p style="margin:0 0 16px 0;">
      Gentile ${escapeHtml(props.recipientName)},<br/>
      le trasmettiamo la fattura n. <strong>${escapeHtml(props.invoiceNumber)}</strong> emessa da
      ${escapeHtml(branding.companyName)}.
    </p>
    <table role="presentation" width="100%" style="background:#F7F9FC;border-radius:8px;padding:16px;margin:16px 0;border-collapse:separate;">
      <tr><td style="padding:4px 0;color:#666666;">Numero fattura:</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(props.invoiceNumber)}</td></tr>
      <tr><td style="padding:4px 0;color:#666666;">Data emissione:</td><td style="padding:4px 0;text-align:right;font-weight:600;">${formatDateIt(props.issueDate)}</td></tr>
      ${dueRow}
      ${orderRow}
      <tr><td style="padding:8px 0 0 0;color:#666666;border-top:1px solid #E5E7EB;">Totale:</td><td style="padding:8px 0 0 0;text-align:right;font-size:18px;font-weight:700;color:${branding.primaryColor};border-top:1px solid #E5E7EB;">${formatEuro(props.totalCents)}</td></tr>
    </table>
    ${renderButton({ label: "Visualizza fattura", href: props.invoiceUrl, branding })}
    <p style="margin:16px 0 0 0;font-size:13px;color:#666666;">
      Per qualsiasi chiarimento siamo a disposizione rispondendo a questa email.
    </p>
  `;

  const html = renderLayout({ branding, innerBodyHtml: innerBody, preheaderText: preheader });

  const text = [
    `Nuova fattura da ${branding.companyName}`,
    "",
    `Gentile ${props.recipientName},`,
    `le trasmettiamo la fattura n. ${props.invoiceNumber}.`,
    "",
    `Numero fattura: ${props.invoiceNumber}`,
    `Data emissione: ${formatDateIt(props.issueDate)}`,
    props.dueDate ? `Scadenza: ${formatDateIt(props.dueDate)}` : "",
    props.orderNumber ? `Ordine collegato: #${props.orderNumber}` : "",
    `Totale: ${formatEuro(props.totalCents)}`,
    "",
    `Visualizza fattura: ${props.invoiceUrl}`,
    "",
    plainTextFooter(branding),
  ].filter(Boolean).join("\n");

  return {
    subject: `Fattura ${props.invoiceNumber} — ${branding.companyName}`,
    html,
    text,
  };
}
