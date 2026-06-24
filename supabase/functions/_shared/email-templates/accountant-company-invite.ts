import { Branding, RenderedTemplate } from "./types.ts";
import { renderSystemEmail } from "./renderSystemEmail.ts";

/** #17 — Invito commercialista. Copy: registro "invito-commercialista-17". */
export interface AccountantCompanyInviteProps {
  recipientName: string;
  companyName: string;
  invitedByName: string;
  accessModeLabel: string;
  portalUrl: string;
  requiresSignup: boolean;
}

export function render(
  props: AccountantCompanyInviteProps,
  branding: Branding,
): RenderedTemplate {
  const { subject, html, text } = renderSystemEmail(
    "invito-commercialista-17",
    {
      nome_azienda: props.companyName,
      nome_commercialista: props.recipientName,
      nome_invitante: props.invitedByName,
      livello_accesso: props.accessModeLabel,
      url1: props.portalUrl,
    },
    { supportEmail: branding.replyTo },
  );
  return { subject, html, text };
}
