import { Branding, RenderedTemplate } from "./types.ts";
import { renderSystemEmail } from "./renderSystemEmail.ts";

/** #24 — Setup incompleto (+48h). Copy: registro "setup-incompleto-24". */
export interface SetupIncompleteProps {
  recipientName: string;
  setupUrl: string;
}

export function render(props: SetupIncompleteProps, branding: Branding): RenderedTemplate {
  const { subject, html, text } = renderSystemEmail(
    "setup-incompleto-24",
    {
      nome_utente: props.recipientName,
      nome_azienda: branding.companyName,
      url1: props.setupUrl,
    },
    { supportEmail: branding.replyTo },
  );
  return { subject, html, text };
}
