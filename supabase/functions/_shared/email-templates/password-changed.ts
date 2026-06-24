import { Branding, RenderedTemplate } from "./types.ts";
import { renderSystemEmail } from "./renderSystemEmail.ts";

/** #8 — Password cambiata (notifica sicurezza). Copy: registro "password-cambiata-8".
 *  NB: il trigger d'invio va ancora agganciato (Fase 5); qui solo il copy. */
export interface PasswordChangedProps {
  recipientName: string;
  changedDate: string;
  changedTime: string;
  supportEmail: string;
}

export function render(props: PasswordChangedProps, branding: Branding): RenderedTemplate {
  const { subject, html, text } = renderSystemEmail(
    "password-cambiata-8",
    {
      nome_utente: props.recipientName,
      nome_azienda: branding.companyName,
      data: props.changedDate,
      ora: props.changedTime,
      email_supporto: props.supportEmail,
    },
    { supportEmail: props.supportEmail },
  );
  return { subject, html, text };
}
