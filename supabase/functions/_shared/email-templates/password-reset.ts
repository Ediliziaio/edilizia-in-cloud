import { Branding, RenderedTemplate, escapeHtml } from "./types.ts";
import { renderLayout, renderButton, plainTextFooter } from "./layout.ts";

export interface PasswordResetProps {
  recipientName: string;
  /** URL one-shot per reimpostare la password. Scade tipicamente in 60 minuti. */
  resetUrl: string;
  /** Minuti di validità del link (default 60). */
  ttlMinutes?: number;
  /** IP del richiedente per audit (opzionale). */
  requestIp?: string;
}

export function render(props: PasswordResetProps, branding: Branding): RenderedTemplate {
  const ttl = props.ttlMinutes ?? 60;
  const preheader = `Reimposta la tua password — link valido ${ttl} minuti`;

  const ipInfo = props.requestIp
    ? `<p style="margin:8px 0 0 0;font-size:12px;color:#999999;">Richiesta effettuata da IP ${escapeHtml(props.requestIp)}.</p>`
    : "";

  const innerBody = `
    <h1 class="h-title" style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:32px;font-weight:700;color:#1a1a1a;">
      Reimposta la tua password
    </h1>
    <p style="margin:0 0 16px 0;">
      Ciao ${escapeHtml(props.recipientName)},<br/>
      abbiamo ricevuto una richiesta di reset password per il tuo account ${escapeHtml(branding.companyName)}.
    </p>
    <p style="margin:0 0 16px 0;">
      Clicca il pulsante qui sotto per impostarne una nuova. <strong>Il link è valido ${ttl} minuti.</strong>
    </p>
    ${renderButton({ label: "Reimposta password", href: props.resetUrl, branding })}
    <p style="margin:16px 0 0 0;font-size:13px;color:#666666;">
      Se non hai richiesto il reset, ignora questa email — la tua password resterà invariata.
    </p>
    ${ipInfo}
  `;

  const html = renderLayout({ branding, innerBodyHtml: innerBody, preheaderText: preheader });

  const text = [
    `Reimposta la tua password — ${branding.companyName}`,
    "",
    `Ciao ${props.recipientName},`,
    `abbiamo ricevuto una richiesta di reset password per il tuo account.`,
    "",
    `Usa questo link per impostarne una nuova (valido ${ttl} minuti):`,
    props.resetUrl,
    "",
    `Se non hai richiesto il reset, ignora questa email.`,
    "",
    plainTextFooter(branding),
  ].join("\n");

  return {
    subject: `Reimposta la tua password — ${branding.companyName}`,
    html,
    text,
  };
}
