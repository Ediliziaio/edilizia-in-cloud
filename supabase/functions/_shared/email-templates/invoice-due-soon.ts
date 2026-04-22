import { Branding, RenderedTemplate, escapeHtml, formatEuro, formatDateIt } from "./types.ts";
import { renderLayout, renderButton, plainTextFooter } from "./layout.ts";

export interface InvoiceDueSoonProps {
  recipientName: string;
  invoiceNumber: string;
  totalCents: number;
  dueDate: string;
  daysUntilDue: number;
  invoiceUrl: string;
  /** URL per pagare online (Stripe/GoCardless) se disponibile. */
  payUrl?: string;
}

export function render(props: InvoiceDueSoonProps, branding: Branding): RenderedTemplate {
  const preheader = `Fattura ${props.invoiceNumber} in scadenza tra ${props.daysUntilDue} giorni`;

  const innerBody = `
    <h1 class="h-title" style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:32px;font-weight:700;color:#1a1a1a;">
      Promemoria pagamento
    </h1>
    <p style="margin:0 0 16px 0;">
      Gentile ${escapeHtml(props.recipientName)},<br/>
      le ricordiamo che la fattura <strong>${escapeHtml(props.invoiceNumber)}</strong> scadrà tra
      <strong>${props.daysUntilDue} giorni</strong>.
    </p>
    <table role="presentation" width="100%" style="background:#FEF3C7;border-radius:8px;padding:16px;margin:16px 0;border-left:4px solid #F59E0B;border-collapse:separate;">
      <tr><td style="padding:4px 0;color:#78350F;">Numero fattura:</td><td style="padding:4px 0;text-align:right;font-weight:600;color:#78350F;">${escapeHtml(props.invoiceNumber)}</td></tr>
      <tr><td style="padding:4px 0;color:#78350F;">Scadenza:</td><td style="padding:4px 0;text-align:right;font-weight:600;color:#78350F;">${formatDateIt(props.dueDate)}</td></tr>
      <tr><td style="padding:8px 0 0 0;color:#78350F;border-top:1px solid #FCD34D;">Importo:</td><td style="padding:8px 0 0 0;text-align:right;font-size:18px;font-weight:700;color:#78350F;border-top:1px solid #FCD34D;">${formatEuro(props.totalCents)}</td></tr>
    </table>
    ${props.payUrl ? renderButton({ label: "Paga ora online", href: props.payUrl, branding }) : renderButton({ label: "Visualizza fattura", href: props.invoiceUrl, branding })}
    <p style="margin:16px 0 0 0;font-size:13px;color:#666666;">
      Se il pagamento è già stato effettuato, ignori questo promemoria. Grazie.
    </p>
  `;

  const html = renderLayout({ branding, innerBodyHtml: innerBody, preheaderText: preheader });

  const text = [
    `Promemoria pagamento — ${branding.companyName}`,
    "",
    `Gentile ${props.recipientName},`,
    `la fattura ${props.invoiceNumber} scadrà tra ${props.daysUntilDue} giorni.`,
    "",
    `Scadenza: ${formatDateIt(props.dueDate)}`,
    `Importo: ${formatEuro(props.totalCents)}`,
    "",
    props.payUrl ? `Paga online: ${props.payUrl}` : "",
    `Visualizza fattura: ${props.invoiceUrl}`,
    "",
    `Se il pagamento è già stato effettuato, ignori questo promemoria.`,
    "",
    plainTextFooter(branding),
  ].filter(Boolean).join("\n");

  return {
    subject: `Promemoria: fattura ${props.invoiceNumber} in scadenza`,
    html,
    text,
  };
}
