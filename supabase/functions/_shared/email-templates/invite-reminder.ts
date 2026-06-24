import { Branding, RenderedTemplate } from "./types.ts";
import { renderSystemEmail } from "./renderSystemEmail.ts";

/** #18 — Reminder invito (+48h). Copy: registro "reminder-invito-18". */
export interface InviteReminderProps {
  recipientName: string;
  inviterName: string;
  inviteUrl: string;
}

export function render(props: InviteReminderProps, branding: Branding): RenderedTemplate {
  const { subject, html, text } = renderSystemEmail(
    "reminder-invito-18",
    {
      nome_utente: props.recipientName,
      nome_invitante: props.inviterName,
      nome_azienda: branding.companyName,
      url1: props.inviteUrl,
    },
    { supportEmail: branding.replyTo },
  );
  return { subject, html, text };
}
