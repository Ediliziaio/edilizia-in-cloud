import { Branding, RenderedTemplate, escapeHtml } from "./types.ts";
import { renderLayout, renderButton, plainTextFooter } from "./layout.ts";

export interface UserInvitedProps {
  recipientName: string;
  /** Nome del mittente (admin che ha invitato). */
  invitedByName: string;
  /** Ruolo assegnato (es. "Operatore", "Amministratore"). */
  roleLabel: string;
  /** URL di accettazione invito (con token). */
  inviteUrl: string;
  /** Ore di validità dell'invito (default 168h = 7 giorni). */
  ttlHours?: number;
}

export function render(props: UserInvitedProps, branding: Branding): RenderedTemplate {
  const ttl = props.ttlHours ?? 168;
  const ttlDays = Math.round(ttl / 24);
  const preheader = `${escapeHtml(props.invitedByName)} ti ha invitato come ${escapeHtml(props.roleLabel)} su ${escapeHtml(branding.companyName)}`;

  const innerBody = `
    <h1 class="h-title" style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:32px;font-weight:700;color:#1a1a1a;">
      Sei stato invitato su ${escapeHtml(branding.companyName)}
    </h1>
    <p style="margin:0 0 16px 0;">
      Ciao ${escapeHtml(props.recipientName)},<br/>
      <strong>${escapeHtml(props.invitedByName)}</strong> ti ha invitato a unirti come
      <strong>${escapeHtml(props.roleLabel)}</strong>.
    </p>
    <p style="margin:0 0 16px 0;">
      Clicca il pulsante per creare il tuo account. L'invito è valido per ${ttlDays} giorn${ttlDays === 1 ? "o" : "i"}.
    </p>
    ${renderButton({ label: "Accetta invito", href: props.inviteUrl, branding })}
    <p style="margin:16px 0 0 0;font-size:13px;color:#666666;">
      Se non riconosci questa richiesta, puoi ignorare l'email.
    </p>
  `;

  const html = renderLayout({ branding, innerBodyHtml: innerBody, preheaderText: preheader });

  const text = [
    `Invito a ${branding.companyName}`,
    "",
    `Ciao ${props.recipientName},`,
    `${props.invitedByName} ti ha invitato come ${props.roleLabel} su ${branding.companyName}.`,
    "",
    `Accetta l'invito qui (valido ${ttlDays} giorn${ttlDays === 1 ? "o" : "i"}):`,
    props.inviteUrl,
    "",
    `Se non riconosci questa richiesta, puoi ignorare l'email.`,
    "",
    plainTextFooter(branding),
  ].join("\n");

  return {
    subject: `Invito a ${branding.companyName}`,
    html,
    text,
  };
}
