import { Branding, RenderedTemplate, escapeHtml } from "./types.ts";
import { renderLayout, renderButton, plainTextFooter } from "./layout.ts";

/** 3.2 — Promemoria invito (+48h, condizionale). Trigger: invito non ancora
 *  accettato dopo 48h. Salta se l'invito è già stato accettato. */
export interface InviteReminderProps {
  /** Nome dell'invitato. */
  recipientName: string;
  /** Nome di chi ha invitato. */
  inviterName: string;
  /** URL per accettare l'invito. */
  inviteUrl: string;
}

export function render(props: InviteReminderProps, branding: Branding): RenderedTemplate {
  const preheader = "Bastano 60 secondi per entrare.";

  const innerBody = `
    <h1 class="h-title" style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:32px;font-weight:700;color:#1a1a1a;">
      Il tuo accesso a ${escapeHtml(branding.companyName)} è in attesa
    </h1>
    <p style="margin:0 0 16px 0;">Ciao ${escapeHtml(props.recipientName)},</p>
    <p style="margin:0 0 16px 0;">
      ${escapeHtml(props.inviterName)} ti ha invitato su ${escapeHtml(branding.companyName)},
      ma non sei ancora entrato.
    </p>
    <p style="margin:0 0 16px 0;">
      Ti basta impostare la password.
      Sessanta secondi e accedi ai cantieri di <strong>${escapeHtml(branding.companyName)}</strong>.
    </p>
    ${renderButton({ label: "Entra ora", href: props.inviteUrl, branding })}
    <p style="margin:16px 0 0 0;font-size:13px;color:#666666;">
      Il link non funziona più? Chiedi a ${escapeHtml(props.inviterName)} di rimandartelo.
    </p>
  `;

  const html = renderLayout({ branding, innerBodyHtml: innerBody, preheaderText: preheader });

  const text = [
    `Il tuo accesso a ${branding.companyName} è in attesa`,
    "",
    `Ciao ${props.recipientName},`,
    `${props.inviterName} ti ha invitato su ${branding.companyName}, ma non sei ancora entrato.`,
    "",
    "Ti basta impostare la password. Sessanta secondi e accedi ai cantieri.",
    "",
    `Entra ora: ${props.inviteUrl}`,
    "",
    `Il link non funziona più? Chiedi a ${props.inviterName} di rimandartelo.`,
    "",
    plainTextFooter(branding),
  ].join("\n");

  return { subject: `Il tuo accesso a ${branding.companyName} è in attesa`, html, text };
}
