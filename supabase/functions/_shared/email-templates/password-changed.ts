import { Branding, RenderedTemplate, escapeHtml } from "./types.ts";
import { renderLayout, plainTextFooter } from "./layout.ts";

/** 2.2 — Password modificata (subito dopo il reset/cambio). Trigger: password
 *  cambiata. Email di sicurezza: avverte l'utente e gli dà un canale se non è stato lui. */
export interface PasswordChangedProps {
  /** Nome destinatario. */
  recipientName: string;
  /** Data del cambio (es. "12/04/2026"). */
  changedDate: string;
  /** Ora del cambio (es. "14:32"). */
  changedTime: string;
  /** Email di supporto a cui scrivere se non è stato l'utente. */
  supportEmail: string;
}

export function render(props: PasswordChangedProps, branding: Branding): RenderedTemplate {
  const preheader = "Se non sei stato tu, leggi subito.";

  const innerBody = `
    <h1 class="h-title" style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:32px;font-weight:700;color:#1a1a1a;">
      La tua password è stata cambiata
    </h1>
    <p style="margin:0 0 16px 0;">Ciao ${escapeHtml(props.recipientName)},</p>
    <p style="margin:0 0 16px 0;">
      la password del tuo account ${escapeHtml(branding.companyName)} è stata cambiata
      il <strong>${escapeHtml(props.changedDate)}</strong> alle <strong>${escapeHtml(props.changedTime)}</strong>.
    </p>
    <p style="margin:0 0 16px 0;">
      Se sei stato tu, è tutto a posto: non devi fare nulla.
    </p>
    <p style="margin:0 0 16px 0;">
      Se <strong>non</strong> sei stato tu, scrivici subito a
      <a href="mailto:${escapeHtml(props.supportEmail)}" style="color:${branding.secondaryColor};">${escapeHtml(props.supportEmail)}</a>.
      Blocchiamo l'accesso e mettiamo in sicurezza il tuo account.
    </p>
  `;

  const html = renderLayout({ branding, innerBodyHtml: innerBody, preheaderText: preheader });

  const text = [
    "La tua password è stata cambiata",
    "",
    `Ciao ${props.recipientName},`,
    `la password del tuo account ${branding.companyName} è stata cambiata il ${props.changedDate} alle ${props.changedTime}.`,
    "",
    "Se sei stato tu, è tutto a posto: non devi fare nulla.",
    `Se NON sei stato tu, scrivici subito a ${props.supportEmail}. Blocchiamo l'accesso e mettiamo in sicurezza il tuo account.`,
    "",
    plainTextFooter(branding),
  ].join("\n");

  return { subject: "La tua password è stata cambiata", html, text };
}
