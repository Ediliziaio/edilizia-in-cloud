import {
  Branding,
  RenderedTemplate,
  escapeHtml,
  formatEuro,
  formatDateIt,
} from "./types.ts";
import { renderLayout, renderButton, plainTextFooter } from "./layout.ts";

/**
 * Email di conferma pagamento ricevuto. Utilizzata quando il cliente salda
 * una fattura o quando viene registrato un incasso parziale.
 */
export interface PaymentReceivedProps {
  recipientName: string;
  /** Numero fattura collegata. */
  invoiceNumber: string;
  /** Importo ricevuto in centesimi di euro. */
  amountCents: number;
  /** Data in cui il pagamento è stato registrato (ISO). */
  paidAt: string;
  /** Metodo di pagamento (es. "Bonifico", "Carta di credito"). */
  paymentMethod?: string;
  /** Eventuale residuo rimanente in centesimi. Se 0 o omesso → saldo. */
  remainingCents?: number;
  /** URL a dashboard/estratto conto. */
  receiptUrl?: string;
}

export function render(
  props: PaymentReceivedProps,
  branding: Branding,
): RenderedTemplate {
  const isFullPayment = !props.remainingCents || props.remainingCents <= 0;
  const preheader = isFullPayment
    ? `Pagamento ricevuto — fattura ${props.invoiceNumber} saldata.`
    : `Pagamento parziale ricevuto — fattura ${props.invoiceNumber}.`;

  const methodRow = props.paymentMethod
    ? `<tr><td style="padding:4px 0;color:#666666;">Metodo:</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(props.paymentMethod)}</td></tr>`
    : "";
  const remainingRow = !isFullPayment
    ? `<tr><td style="padding:8px 0 0 0;color:#666666;border-top:1px solid #E5E7EB;">Residuo da saldare:</td><td style="padding:8px 0 0 0;text-align:right;font-size:16px;font-weight:700;color:#DC2626;border-top:1px solid #E5E7EB;">${formatEuro(props.remainingCents!)}</td></tr>`
    : `<tr><td style="padding:8px 0 0 0;color:#666666;border-top:1px solid #E5E7EB;">Stato:</td><td style="padding:8px 0 0 0;text-align:right;font-size:16px;font-weight:700;color:#16A34A;border-top:1px solid #E5E7EB;">Saldata ✓</td></tr>`;

  const cta = props.receiptUrl
    ? renderButton({
        label: "Visualizza ricevuta",
        href: props.receiptUrl,
        branding,
      })
    : "";

  const innerBody = `
    <h1 class="h-title" style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:32px;font-weight:700;color:#1a1a1a;">
      ${isFullPayment ? "Pagamento ricevuto ✓" : "Pagamento parziale ricevuto"}
    </h1>
    <p style="margin:0 0 16px 0;">
      Gentile ${escapeHtml(props.recipientName)},<br/>
      confermiamo la ricezione del pagamento relativo alla fattura
      <strong>${escapeHtml(props.invoiceNumber)}</strong>.
    </p>
    <table role="presentation" width="100%" style="background:#F7F9FC;border-radius:8px;padding:16px;margin:16px 0;border-collapse:separate;">
      <tr><td style="padding:4px 0;color:#666666;">Fattura:</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(props.invoiceNumber)}</td></tr>
      <tr><td style="padding:4px 0;color:#666666;">Data pagamento:</td><td style="padding:4px 0;text-align:right;font-weight:600;">${formatDateIt(props.paidAt)}</td></tr>
      ${methodRow}
      <tr><td style="padding:4px 0;color:#666666;">Importo ricevuto:</td><td style="padding:4px 0;text-align:right;font-size:18px;font-weight:700;color:${branding.primaryColor};">${formatEuro(props.amountCents)}</td></tr>
      ${remainingRow}
    </table>
    ${cta}
    <p style="margin:16px 0 0 0;font-size:13px;color:#666666;">
      Grazie per la puntualità. Per qualsiasi chiarimento rispondi a questa email.
    </p>
  `;

  const html = renderLayout({
    branding,
    innerBodyHtml: innerBody,
    preheaderText: preheader,
  });

  const text = [
    `${isFullPayment ? "Pagamento ricevuto" : "Pagamento parziale ricevuto"} — ${branding.companyName}`,
    "",
    `Gentile ${props.recipientName},`,
    `confermiamo la ricezione del pagamento relativo alla fattura ${props.invoiceNumber}.`,
    "",
    `Fattura: ${props.invoiceNumber}`,
    `Data pagamento: ${formatDateIt(props.paidAt)}`,
    props.paymentMethod ? `Metodo: ${props.paymentMethod}` : "",
    `Importo ricevuto: ${formatEuro(props.amountCents)}`,
    isFullPayment
      ? "Stato: Saldata"
      : `Residuo da saldare: ${formatEuro(props.remainingCents!)}`,
    "",
    props.receiptUrl ? `Visualizza ricevuta: ${props.receiptUrl}` : "",
    "",
    "Grazie per la puntualità.",
    "",
    plainTextFooter(branding),
  ]
    .filter(Boolean)
    .join("\n");

  return {
    subject: isFullPayment
      ? `Pagamento ricevuto — fattura ${props.invoiceNumber}`
      : `Pagamento parziale — fattura ${props.invoiceNumber}`,
    html,
    text,
  };
}
