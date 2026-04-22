import { Branding, RenderedTemplate, escapeHtml, formatDateIt } from "./types.ts";
import { renderLayout, renderButton, plainTextFooter } from "./layout.ts";

export interface DdtSentProps {
  recipientName: string;
  ddtNumber: string;
  issueDate: string;
  ddtUrl: string;
  /** Numero ordine collegato (opzionale). */
  orderNumber?: string;
  /** Destinazione merce (opzionale). */
  destinationAddress?: string;
}

export function render(props: DdtSentProps, branding: Branding): RenderedTemplate {
  const preheader = `DDT ${props.ddtNumber} — ${escapeHtml(branding.companyName)}`;

  const orderRow = props.orderNumber
    ? `<tr><td style="padding:4px 0;color:#666666;">Ordine collegato:</td><td style="padding:4px 0;text-align:right;font-weight:600;">#${escapeHtml(props.orderNumber)}</td></tr>`
    : "";
  const destRow = props.destinationAddress
    ? `<tr><td style="padding:4px 0;color:#666666;vertical-align:top;">Destinazione:</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(props.destinationAddress)}</td></tr>`
    : "";

  const innerBody = `
    <h1 class="h-title" style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:32px;font-weight:700;color:#1a1a1a;">
      Documento di Trasporto
    </h1>
    <p style="margin:0 0 16px 0;">
      Gentile ${escapeHtml(props.recipientName)},<br/>
      le trasmettiamo il DDT n. <strong>${escapeHtml(props.ddtNumber)}</strong> per la merce in consegna.
    </p>
    <table role="presentation" width="100%" style="background:#F7F9FC;border-radius:8px;padding:16px;margin:16px 0;border-collapse:separate;">
      <tr><td style="padding:4px 0;color:#666666;">Numero DDT:</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(props.ddtNumber)}</td></tr>
      <tr><td style="padding:4px 0;color:#666666;">Data emissione:</td><td style="padding:4px 0;text-align:right;font-weight:600;">${formatDateIt(props.issueDate)}</td></tr>
      ${orderRow}
      ${destRow}
    </table>
    ${renderButton({ label: "Visualizza DDT", href: props.ddtUrl, branding })}
    <p style="margin:16px 0 0 0;font-size:13px;color:#666666;">
      Alla consegna verrà richiesta la firma per ricevuta.
    </p>
  `;

  const html = renderLayout({ branding, innerBodyHtml: innerBody, preheaderText: preheader });

  const text = [
    `Documento di Trasporto — ${branding.companyName}`,
    "",
    `Gentile ${props.recipientName},`,
    `le trasmettiamo il DDT n. ${props.ddtNumber}.`,
    "",
    `Numero DDT: ${props.ddtNumber}`,
    `Data emissione: ${formatDateIt(props.issueDate)}`,
    props.orderNumber ? `Ordine collegato: #${props.orderNumber}` : "",
    props.destinationAddress ? `Destinazione: ${props.destinationAddress}` : "",
    "",
    `Visualizza DDT: ${props.ddtUrl}`,
    "",
    plainTextFooter(branding),
  ].filter(Boolean).join("\n");

  return {
    subject: `DDT ${props.ddtNumber} — ${branding.companyName}`,
    html,
    text,
  };
}
