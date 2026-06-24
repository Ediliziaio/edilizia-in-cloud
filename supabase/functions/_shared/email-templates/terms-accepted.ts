import { Branding, RenderedTemplate } from "./types.ts";
import { renderSystemEmail } from "./renderSystemEmail.ts";

/** #2 — Documenti accettati (copia termini/privacy/DPA). Copy: registro
 *  "documenti-accettati-2" (riscritto dall'utente). Delego al renderer unico
 *  mantenendo la firma invariata per i chiamanti. */
export interface TermsAcceptedProps {
  recipientName: string;
  acceptedDate: string;
  acceptedTime: string;
  tcUrl: string;
  tcVersion: string;
  privacyUrl: string;
  privacyVersion: string;
  dpaUrl: string;
  dpaVersion: string;
  cookieUrl: string;
  cookieVersion: string;
  moduloOperaiUrl: string;
}

export function render(props: TermsAcceptedProps, branding: Branding): RenderedTemplate {
  const { subject, html, text } = renderSystemEmail(
    "documenti-accettati-2",
    {
      nome_azienda: branding.companyName,
      nome_utente: props.recipientName,
      data: props.acceptedDate,
      ora: props.acceptedTime,
      // Link CTA in ordine documento: 4 documenti + bottone "Apri i tuoi documenti"
      url1: props.tcUrl,
      url2: props.privacyUrl,
      url3: props.dpaUrl,
      url4: props.cookieUrl,
      url5: props.moduloOperaiUrl,
    },
    { supportEmail: branding.replyTo },
  );
  return { subject, html, text };
}
