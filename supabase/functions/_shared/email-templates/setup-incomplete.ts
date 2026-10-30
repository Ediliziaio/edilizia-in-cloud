import { Branding, RenderedTemplate } from "./types.ts";
import { renderSystemEmail } from "./renderSystemEmail.ts";

/** #24 — Setup incompleto (+48h). Copy: registro "setup-incompleto-24". */
export interface SetupIncompleteProps {
  recipientName: string;
  setupUrl: string;
  /**
   * Il nome dell'azienda del cliente. È un'email della piattaforma (logo e
   * firma di Edilizia in Cloud): senza, il testo diceva «il setup di Edilizia
   * in Cloud è a metà».
   */
  companyName?: string;
}

export function render(props: SetupIncompleteProps, branding: Branding): RenderedTemplate {
  const { subject, html, text } = renderSystemEmail(
    "setup-incompleto-24",
    {
      nome_utente: props.recipientName,
      nome_azienda: props.companyName || branding.companyName,
      url1: props.setupUrl,
    },
    { supportEmail: branding.replyTo, logoUrl: branding.logoUrl },
  );
  return { subject, html, text };
}
