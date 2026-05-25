import { Branding, RenderedTemplate, escapeHtml } from "./types.ts";
import { renderLayout, renderButton } from "./layout.ts";

export interface AccountantCompanyInviteProps {
  recipientName: string;
  /** Nome dell'azienda che ha invitato. */
  companyName: string;
  /** Nome dell'utente azienda che ha mandato l'invito. */
  invitedByName: string;
  /** Modalità di accesso: solo_lettura / operativo / approvazione. */
  accessModeLabel: string;
  /** URL portale commercialista (login o accept-invite). */
  portalUrl: string;
  /** True se l'invitato non ha ancora un account commercialista. */
  requiresSignup: boolean;
}

export function render(
  props: AccountantCompanyInviteProps,
  branding: Branding,
): RenderedTemplate {
  const subject = `${props.companyName} ti ha invitato come commercialista`;
  const preheader = `${escapeHtml(props.invitedByName)} ti ha invitato come commercialista di ${escapeHtml(props.companyName)} su ${escapeHtml(branding.companyName)}`;

  const ctaLabel = props.requiresSignup
    ? "Crea il tuo account studio"
    : "Apri il portale commercialista";

  const signupNote = props.requiresSignup
    ? `<p style="margin:0 0 16px 0;">
        Non hai ancora un account commercialista? Nessun problema:
        ti basta cliccare il pulsante qui sotto, registrare lo studio
        in 60 secondi e vedrai subito ${escapeHtml(props.companyName)}
        tra i tuoi clienti.
      </p>`
    : `<p style="margin:0 0 16px 0;">
        Accedi al tuo portale studio per accettare l'invito e iniziare
        a operare su ${escapeHtml(props.companyName)} con i permessi assegnati.
      </p>`;

  const innerBody = `
    <h1 style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:32px;font-weight:700;color:#1a1a1a;">
      ${escapeHtml(props.companyName)} ti ha invitato
    </h1>
    <p style="margin:0 0 16px 0;">
      Ciao ${escapeHtml(props.recipientName)},<br/>
      <strong>${escapeHtml(props.invitedByName)}</strong> dell'azienda
      <strong>${escapeHtml(props.companyName)}</strong> ti ha invitato a
      gestire i loro dati come commercialista, con livello di accesso
      <strong>${escapeHtml(props.accessModeLabel)}</strong>.
    </p>
    ${signupNote}
    ${renderButton({ label: ctaLabel, href: props.portalUrl, branding })}
    <p style="margin:16px 0 0 0;font-size:13px;color:#666666;">
      Se non riconosci questa richiesta puoi ignorare l'email — l'azienda
      non avrà accesso al tuo studio finché non accetti l'invito.
    </p>
  `;

  const html = renderLayout({
    branding,
    innerBodyHtml: innerBody,
    preheaderText: preheader,
  });

  const text = [
    `Ciao ${props.recipientName},`,
    "",
    `${props.invitedByName} di ${props.companyName} ti ha invitato come commercialista su ${branding.companyName} con livello di accesso "${props.accessModeLabel}".`,
    "",
    props.requiresSignup
      ? `Per accettare l'invito crea il tuo account studio: ${props.portalUrl}`
      : `Apri il portale commercialista per accettare: ${props.portalUrl}`,
    "",
    "Se non riconosci questa richiesta puoi ignorare l'email.",
  ].join("\n");

  return { subject, html, text };
}
