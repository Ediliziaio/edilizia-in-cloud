import { Branding, RenderedTemplate, escapeHtml } from "./types.ts";
import { renderLayout, renderButton, plainTextFooter } from "./layout.ts";

/**
 * Email di verifica indirizzo email dopo registrazione.
 * Separata da welcome.ts perché il flow è diverso: qui l'account NON è ancora
 * attivo — il link esegue il passaggio di verifica, poi reindirizza al login.
 */
export interface AccountVerifyProps {
  /** Nome destinatario. */
  recipientName: string;
  /** Link univoco per confermare l'email. */
  verifyUrl: string;
  /** Scadenza del link (es. "24 ore"). */
  expiresIn?: string;
}

export function render(
  props: AccountVerifyProps,
  branding: Branding,
): RenderedTemplate {
  const preheader = `Conferma il tuo indirizzo email per attivare l'account.`;
  const expiryLabel = props.expiresIn || "24 ore";

  const innerBody = `
    <h1 class="h-title" style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:32px;font-weight:700;color:#1a1a1a;">
      Conferma il tuo indirizzo email
    </h1>
    <p style="margin:0 0 16px 0;">
      Ciao ${escapeHtml(props.recipientName)},
    </p>
    <p style="margin:0 0 16px 0;">
      per attivare il tuo account su <strong>${escapeHtml(branding.companyName)}</strong>,
      conferma che questo è il tuo indirizzo email cliccando sul pulsante qui sotto.
    </p>
    ${renderButton({ label: "Conferma email", href: props.verifyUrl, branding })}
    <p style="margin:16px 0 8px 0;font-size:13px;color:#666666;">
      Il link è valido per ${escapeHtml(expiryLabel)}. Scaduto questo termine
      dovrai richiedere un nuovo invio dalla pagina di login.
    </p>
    <p style="margin:16px 0 0 0;font-size:13px;color:#888888;">
      Non hai creato tu questo account? Puoi ignorare questa email: senza
      conferma l'account non verrà attivato.
    </p>
  `;

  const html = renderLayout({
    branding,
    innerBodyHtml: innerBody,
    preheaderText: preheader,
  });

  const text = [
    `Conferma il tuo indirizzo email — ${branding.companyName}`,
    "",
    `Ciao ${props.recipientName},`,
    `per attivare il tuo account conferma il tuo indirizzo email.`,
    "",
    `Conferma qui: ${props.verifyUrl}`,
    "",
    `Il link è valido per ${expiryLabel}.`,
    "",
    "Non hai creato tu questo account? Puoi ignorare questa email.",
    "",
    plainTextFooter(branding),
  ].join("\n");

  return {
    subject: `Conferma la tua email — ${branding.companyName}`,
    html,
    text,
  };
}
