import { Branding, RenderedTemplate, escapeHtml } from "./types.ts";
import { renderLayout, renderButton, plainTextFooter } from "./layout.ts";

/** 4 — Conferma acquisto (abbonamento attivato). Trigger: prima attivazione a
 *  pagamento (transizione → active). Diverso da payment_received (ricevuta fattura). */
export interface PurchaseConfirmedProps {
  recipientName: string;
  /** Nome del piano (es. "Pro"). */
  planName: string;
  /** Importo già formattato (es. "49,00 €"). Opzionale. */
  amountFormatted?: string;
  /** Periodicità (es. "mensile", "annuale"). Opzionale. */
  periodicity?: string;
  /** Data prossimo rinnovo (es. "12/05/2026"). Opzionale. */
  renewalDate?: string;
  /** Link alla fattura. Opzionale. */
  invoiceUrl?: string;
  /** Link per entrare nell'app. */
  appUrl: string;
}

export function render(props: PurchaseConfirmedProps, branding: Branding): RenderedTemplate {
  const preheader = "Ecco i dettagli del tuo abbonamento.";

  const rows: string[] = [
    `<tr><td style="padding:4px 0;color:#666666;">Piano:</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(props.planName)}</td></tr>`,
  ];
  if (props.amountFormatted) {
    const per = props.periodicity ? ` (${escapeHtml(props.periodicity)})` : "";
    rows.push(`<tr><td style="padding:4px 0;color:#666666;">Importo:</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(props.amountFormatted)}${per}</td></tr>`);
  }
  if (props.renewalDate) {
    rows.push(`<tr><td style="padding:4px 0;color:#666666;">Prossimo rinnovo:</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(props.renewalDate)}</td></tr>`);
  }

  const invoiceLine = props.invoiceUrl
    ? `<p style="margin:8px 0 0 0;font-size:13px;"><a href="${props.invoiceUrl}" style="color:${branding.secondaryColor};">Scarica la fattura</a></p>`
    : "";

  const innerBody = `
    <h1 class="h-title" style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:32px;font-weight:700;color:#1a1a1a;">
      È ufficiale: ${escapeHtml(branding.companyName)} è dentro
    </h1>
    <p style="margin:0 0 16px 0;">Ciao ${escapeHtml(props.recipientName)},</p>
    <p style="margin:0 0 16px 0;">
      ci sei. L'abbonamento di <strong>${escapeHtml(branding.companyName)}</strong> è attivo.
      Da oggi preventivi, cantieri e fatture stanno tutti in un posto — e in cantiere ce l'hai in tasca.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 4px 0;font-size:14px;">
      ${rows.join("")}
    </table>
    ${invoiceLine}
    <div style="margin:16px 0 0 0;">
      ${renderButton({ label: "Apri EdiliziaInCloud", href: props.appUrl, branding })}
    </div>
    <p style="margin:16px 0 0 0;font-size:13px;color:#666666;">
      Sei 100% soddisfatto o rimborsato, e disdici quando vuoi. Se ti serve una mano per partire,
      rispondi a questa email: ci organizziamo.
    </p>
  `;

  const html = renderLayout({ branding, innerBodyHtml: innerBody, preheaderText: preheader });

  const text = [
    `È ufficiale: ${branding.companyName} è dentro`,
    "",
    `Ciao ${props.recipientName},`,
    `l'abbonamento di ${branding.companyName} è attivo.`,
    "",
    `Piano: ${props.planName}`,
    props.amountFormatted ? `Importo: ${props.amountFormatted}${props.periodicity ? ` (${props.periodicity})` : ""}` : "",
    props.renewalDate ? `Prossimo rinnovo: ${props.renewalDate}` : "",
    props.invoiceUrl ? `Fattura: ${props.invoiceUrl}` : "",
    "",
    `Apri EdiliziaInCloud: ${props.appUrl}`,
    "",
    "Sei 100% soddisfatto o rimborsato, disdici quando vuoi.",
    "",
    plainTextFooter(branding),
  ].filter(Boolean).join("\n");

  return { subject: `È ufficiale: ${branding.companyName} è dentro`, html, text };
}
