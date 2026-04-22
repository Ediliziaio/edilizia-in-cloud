import { Branding, RenderedTemplate, escapeHtml, formatEuro, formatDateIt } from "./types.ts";
import { renderLayout, renderButton, plainTextFooter } from "./layout.ts";

export interface QuoteSentProps {
  recipientName: string;
  quoteNumber: string;
  totalCents: number;
  issueDate: string;
  expiryDate?: string;
  quoteUrl: string;
  /** URL per accettazione/firma online (opzionale). */
  acceptanceUrl?: string;
}

export function render(props: QuoteSentProps, branding: Branding): RenderedTemplate {
  const preheader = `Preventivo ${props.quoteNumber} — ${formatEuro(props.totalCents)}`;

  const expiryRow = props.expiryDate
    ? `<tr><td style="padding:4px 0;color:#666666;">Validità fino al:</td><td style="padding:4px 0;text-align:right;font-weight:600;">${formatDateIt(props.expiryDate)}</td></tr>`
    : "";

  const primaryCta = props.acceptanceUrl
    ? renderButton({ label: "Accetta preventivo", href: props.acceptanceUrl, branding })
    : renderButton({ label: "Visualizza preventivo", href: props.quoteUrl, branding });
  const secondaryLink = props.acceptanceUrl
    ? `<p style="margin:16px 0 0 0;font-size:13px;text-align:center;">
         <a href="${escapeHtml(props.quoteUrl)}" style="color:${branding.primaryColor};">Visualizza il preventivo</a>
       </p>`
    : "";

  const innerBody = `
    <h1 class="h-title" style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:32px;font-weight:700;color:#1a1a1a;">
      Il tuo preventivo è pronto
    </h1>
    <p style="margin:0 0 16px 0;">
      Gentile ${escapeHtml(props.recipientName)},<br/>
      in allegato il preventivo <strong>${escapeHtml(props.quoteNumber)}</strong> come da nostra conversazione.
    </p>
    <table role="presentation" width="100%" style="background:#F7F9FC;border-radius:8px;padding:16px;margin:16px 0;border-collapse:separate;">
      <tr><td style="padding:4px 0;color:#666666;">Numero preventivo:</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(props.quoteNumber)}</td></tr>
      <tr><td style="padding:4px 0;color:#666666;">Data:</td><td style="padding:4px 0;text-align:right;font-weight:600;">${formatDateIt(props.issueDate)}</td></tr>
      ${expiryRow}
      <tr><td style="padding:8px 0 0 0;color:#666666;border-top:1px solid #E5E7EB;">Totale:</td><td style="padding:8px 0 0 0;text-align:right;font-size:20px;font-weight:700;color:${branding.primaryColor};border-top:1px solid #E5E7EB;">${formatEuro(props.totalCents)}</td></tr>
    </table>
    ${primaryCta}
    ${secondaryLink}
    <p style="margin:16px 0 0 0;font-size:13px;color:#666666;">
      Per domande o modifiche può rispondere direttamente a questa email.
    </p>
  `;

  const html = renderLayout({ branding, innerBodyHtml: innerBody, preheaderText: preheader });

  const text = [
    `Preventivo ${props.quoteNumber} — ${branding.companyName}`,
    "",
    `Gentile ${props.recipientName},`,
    `in allegato il preventivo ${props.quoteNumber}.`,
    "",
    `Data: ${formatDateIt(props.issueDate)}`,
    props.expiryDate ? `Validità: ${formatDateIt(props.expiryDate)}` : "",
    `Totale: ${formatEuro(props.totalCents)}`,
    "",
    props.acceptanceUrl ? `Accetta: ${props.acceptanceUrl}` : "",
    `Visualizza: ${props.quoteUrl}`,
    "",
    plainTextFooter(branding),
  ].filter(Boolean).join("\n");

  return {
    subject: `Preventivo ${props.quoteNumber} — ${branding.companyName}`,
    html,
    text,
  };
}
