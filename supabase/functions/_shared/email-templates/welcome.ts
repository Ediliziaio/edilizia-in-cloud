import { Branding, RenderedTemplate, escapeHtml } from "./types.ts";
import { renderLayout, renderButton, plainTextFooter } from "./layout.ts";

export interface WelcomeProps {
  /** Nome destinatario (es. "Marco"). */
  recipientName: string;
  /** URL per il primo accesso (magic link / setup account). */
  loginUrl: string;
  /** Ruolo assegnato (es. "Amministratore"). */
  roleLabel?: string;
}

export function render(props: WelcomeProps, branding: Branding): RenderedTemplate {
  const preheader = `Benvenuto in ${branding.companyName}. Il tuo account è attivo.`;

  const innerBody = `
    <h1 class="h-title" style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:32px;font-weight:700;color:#1a1a1a;">
      Benvenuto in ${escapeHtml(branding.companyName)}!
    </h1>
    <p style="margin:0 0 16px 0;">
      Ciao ${escapeHtml(props.recipientName)},
    </p>
    <p style="margin:0 0 16px 0;">
      il tuo account è stato attivato${props.roleLabel ? ` con il ruolo <strong>${escapeHtml(props.roleLabel)}</strong>` : ""}.
      Puoi accedere alla piattaforma e iniziare a lavorare subito.
    </p>
    ${renderButton({ label: "Accedi ora", href: props.loginUrl, branding })}
    <p style="margin:16px 0 0 0;font-size:13px;color:#666666;">
      Se hai problemi, rispondi a questa email: saremo felici di aiutarti.
    </p>
  `;

  const html = renderLayout({ branding, innerBodyHtml: innerBody, preheaderText: preheader });

  const text = [
    `Benvenuto in ${branding.companyName}!`,
    "",
    `Ciao ${props.recipientName},`,
    `il tuo account è stato attivato${props.roleLabel ? ` con il ruolo ${props.roleLabel}` : ""}.`,
    "",
    `Accedi qui: ${props.loginUrl}`,
    "",
    "Se hai problemi, rispondi a questa email.",
    "",
    plainTextFooter(branding),
  ].join("\n");

  return {
    subject: `Benvenuto in ${branding.companyName}`,
    html,
    text,
  };
}
