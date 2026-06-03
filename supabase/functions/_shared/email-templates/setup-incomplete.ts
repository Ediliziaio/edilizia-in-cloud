import { Branding, RenderedTemplate, escapeHtml } from "./types.ts";
import { renderLayout, renderButton, plainTextFooter } from "./layout.ts";

/** 1.2 — Setup non completato (+48h, condizionale). Trigger: account creato ma
 *  setup ancora incompleto dopo 48h. Salta se il setup è già completo. */
export interface SetupIncompleteProps {
  /** Nome destinatario (es. "Marco"). */
  recipientName: string;
  /** URL per riprendere il setup. */
  setupUrl: string;
}

export function render(props: SetupIncompleteProps, branding: Branding): RenderedTemplate {
  const preheader = `Il setup di ${branding.companyName} è fermo a metà.`;

  const innerBody = `
    <h1 class="h-title" style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:32px;font-weight:700;color:#1a1a1a;">
      Manca poco per partire, ${escapeHtml(props.recipientName)}
    </h1>
    <p style="margin:0 0 16px 0;">Ciao ${escapeHtml(props.recipientName)},</p>
    <p style="margin:0 0 16px 0;">
      hai creato l'account ma il setup di <strong>${escapeHtml(branding.companyName)}</strong> è ancora a metà.
    </p>
    <p style="margin:0 0 16px 0;">
      Ti restano due passi: completare i dati per le fatture e creare il primo cantiere.
      Cinque minuti e sei operativo per davvero.
    </p>
    ${renderButton({ label: "Riprendi da dove eri", href: props.setupUrl, branding })}
    <p style="margin:16px 0 0 0;font-size:13px;color:#666666;">
      Se qualcosa non è chiaro, scrivici. Ti diamo una mano noi.
    </p>
  `;

  const html = renderLayout({ branding, innerBodyHtml: innerBody, preheaderText: preheader });

  const text = [
    `Manca poco per partire, ${props.recipientName}`,
    "",
    `Ciao ${props.recipientName},`,
    `hai creato l'account ma il setup di ${branding.companyName} è ancora a metà.`,
    "",
    "Ti restano due passi: completare i dati per le fatture e creare il primo cantiere.",
    "Cinque minuti e sei operativo per davvero.",
    "",
    `Riprendi da dove eri: ${props.setupUrl}`,
    "",
    "Se qualcosa non è chiaro, scrivici. Ti diamo una mano noi.",
    "",
    plainTextFooter(branding),
  ].join("\n");

  return { subject: `Manca poco per partire, ${props.recipientName}`, html, text };
}
