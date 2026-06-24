import { Branding, RenderedTemplate } from "./types.ts";
import { renderSystemEmail } from "./renderSystemEmail.ts";

/** #6 — Reset password self-service. Copy: registro "reset-password-self-service-6". */
export interface PasswordResetProps {
  recipientName: string;
  /** URL one-shot per reimpostare la password. */
  resetUrl: string;
  /** Minuti di validità del link (default 60). Non più mostrato nel copy. */
  ttlMinutes?: number;
  requestIp?: string;
}

export function render(props: PasswordResetProps, branding: Branding): RenderedTemplate {
  const { subject, html, text } = renderSystemEmail(
    "reset-password-self-service-6",
    {
      nome_utente: props.recipientName,
      url1: props.resetUrl,
    },
    { supportEmail: branding.replyTo },
  );
  return { subject, html, text };
}
