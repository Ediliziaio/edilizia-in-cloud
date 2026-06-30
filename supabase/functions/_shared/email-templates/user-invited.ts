import { Branding, RenderedTemplate } from "./types.ts";
import { renderSystemEmail } from "./renderSystemEmail.ts";

/** #16 — Invito admin piattaforma. Copy: registro "invito-admin-piattaforma-16". */
export interface UserInvitedProps {
  recipientName: string;
  invitedByName: string;
  roleLabel: string;
  inviteUrl: string;
  ttlHours?: number;
}

export function render(props: UserInvitedProps, branding: Branding): RenderedTemplate {
  const { subject, html, text } = renderSystemEmail(
    "invito-admin-piattaforma-16",
    {
      nome_utente: props.recipientName,
      nome_invitante: props.invitedByName,
      ruolo: props.roleLabel,
      url1: props.inviteUrl,
    },
    { supportEmail: branding.replyTo },
  );
  return { subject, html, text };
}
