import { Branding, RenderedTemplate, escapeHtml } from "./types.ts";
import { renderLayout, plainTextFooter } from "./layout.ts";

/** 6 — Conferma accettazione termini + copia documenti. Trigger: registrazione
 *  con spunta "accetto i Termini e Condizioni". Prova legale + buona prassi B2B:
 *  invia copia dei documenti accettati con versione e data. */
export interface TermsAcceptedProps {
  recipientName: string;
  /** Data accettazione (es. "12/04/2026"). */
  acceptedDate: string;
  /** Ora accettazione (es. "14:32"). */
  acceptedTime: string;
  tcUrl: string;
  tcVersion: string;
  privacyUrl: string;
  privacyVersion: string;
  dpaUrl: string;
  dpaVersion: string;
  cookieUrl: string;
  cookieVersion: string;
  /** Modulo privacy da consegnare agli operai (GPS/timbrature). */
  moduloOperaiUrl: string;
}

function docRow(label: string, version: string, url: string): string {
  return `<li style="margin:0 0 8px 0;">${escapeHtml(label)} (vers. ${escapeHtml(version)}) → <a href="${url}" style="color:#1E3A5F;">apri il documento</a></li>`;
}

export function render(props: TermsAcceptedProps, branding: Branding): RenderedTemplate {
  const preheader = "Conservali: è la tua copia, per i tuoi archivi.";

  const innerBody = `
    <h1 class="h-title" style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:32px;font-weight:700;color:#1a1a1a;">
      I documenti che hai accettato, ${escapeHtml(props.recipientName)}
    </h1>
    <p style="margin:0 0 16px 0;">Ciao ${escapeHtml(props.recipientName)},</p>
    <p style="margin:0 0 16px 0;">
      quando hai registrato <strong>${escapeHtml(branding.companyName)}</strong> su EdiliziaInCloud
      hai accettato i nostri termini. Qui trovi la tua copia, da tenere.
    </p>
    <p style="margin:0 0 16px 0;font-size:13px;color:#666666;">
      Accettazione registrata il ${escapeHtml(props.acceptedDate)} alle ${escapeHtml(props.acceptedTime)}.
    </p>
    <p style="margin:0 0 8px 0;font-weight:700;">I documenti:</p>
    <ul style="margin:0 0 16px 0;padding-left:20px;">
      ${docRow("Termini e Condizioni del Servizio", props.tcVersion, props.tcUrl)}
      ${docRow("Privacy Policy", props.privacyVersion, props.privacyUrl)}
      ${docRow("Accordo sul trattamento dei dati – DPA", props.dpaVersion, props.dpaUrl)}
      ${docRow("Cookie Policy", props.cookieVersion, props.cookieUrl)}
    </ul>
    <p style="margin:0 0 8px 0;">
      Un documento in più, utile a te: quando fai usare l'app ai tuoi operai (GPS, timbrature),
      devi dare loro l'informativa privacy. Te la lasciamo già pronta:
    </p>
    <ul style="margin:0 0 16px 0;padding-left:20px;">
      <li style="margin:0;">Modulo Privacy per i Lavoratori → <a href="${props.moduloOperaiUrl}" style="color:#1E3A5F;">apri il modulo</a></li>
    </ul>
    <p style="margin:0;font-size:13px;color:#666666;">
      Conserva questa email: qui hai sempre i riferimenti di quello che hai accettato.
      Se ti serve il Contratto di Servizio firmato in PDF, scrivici: te lo prepariamo.
    </p>
  `;

  const html = renderLayout({ branding, innerBodyHtml: innerBody, preheaderText: preheader });

  const text = [
    `I documenti che hai accettato, ${props.recipientName}`,
    "",
    `Ciao ${props.recipientName},`,
    `quando hai registrato ${branding.companyName} su EdiliziaInCloud hai accettato i nostri termini. Qui trovi la tua copia.`,
    `Accettazione registrata il ${props.acceptedDate} alle ${props.acceptedTime}.`,
    "",
    "I documenti:",
    `- Termini e Condizioni del Servizio (vers. ${props.tcVersion}): ${props.tcUrl}`,
    `- Privacy Policy (vers. ${props.privacyVersion}): ${props.privacyUrl}`,
    `- Accordo sul trattamento dei dati – DPA (vers. ${props.dpaVersion}): ${props.dpaUrl}`,
    `- Cookie Policy (vers. ${props.cookieVersion}): ${props.cookieUrl}`,
    "",
    `Modulo Privacy per i Lavoratori: ${props.moduloOperaiUrl}`,
    "",
    "Conserva questa email: qui hai sempre i riferimenti di quello che hai accettato.",
    "",
    plainTextFooter(branding),
  ].join("\n");

  return { subject: `I documenti che hai accettato, ${props.recipientName}`, html, text };
}
