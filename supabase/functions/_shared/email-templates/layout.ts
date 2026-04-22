// deno-lint-ignore-file
import { Branding, escapeHtml } from "./types.ts";

/**
 * Layout condiviso per tutti i template email.
 *
 * Pattern HTML + CSS inline per massima compatibilità con i client email
 * più vecchi (Outlook 2013+, Apple Mail, Gmail web, ecc.). La struttura usa
 * <table> nidificati perché i client legacy ignorano <div flex/grid>.
 *
 * Input:
 *   - branding: dati azienda (logo, colori, footer)
 *   - innerBodyHtml: contenuto centrale già renderizzato dal template specifico
 *   - preheaderText: testo preview del client (150 caratteri max)
 *   - isMarketing: se true aggiunge footer unsubscribe obbligatorio (CAN-SPAM)
 */
export function renderLayout(params: {
  branding: Branding;
  innerBodyHtml: string;
  preheaderText?: string;
  isMarketing?: boolean;
}): string {
  const { branding, innerBodyHtml, preheaderText, isMarketing } = params;

  const logoBlock = branding.logoUrl
    ? `<img src="${escapeHtml(branding.logoUrl)}" alt="${escapeHtml(
        branding.companyName,
      )}" height="48" style="display:block;border:0;outline:none;text-decoration:none;max-height:48px;" />`
    : `<div style="font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;color:${branding.primaryColor};">${escapeHtml(branding.companyName)}</div>`;

  const marketingFooter = isMarketing
    ? branding.unsubscribeFooterHtml ||
      `
      <tr>
        <td style="padding:16px 24px 24px 24px;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#666666;line-height:1.5;">
          Hai ricevuto questa email perché iscritto alla newsletter di ${escapeHtml(branding.companyName)}.<br/>
          ${
            branding.unsubscribeUrl
              ? `<a href="${escapeHtml(branding.unsubscribeUrl)}" style="color:#666666;text-decoration:underline;">Annulla l'iscrizione</a>`
              : "Per annullare l'iscrizione rispondi con oggetto: DISISCRIVI."
          }
        </td>
      </tr>
    `
    : "";

  const poweredBy = branding.showPoweredBy
    ? `
      <tr>
        <td style="padding:8px 24px 20px 24px;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#999999;">
          Inviato con <a href="https://ediliziaincloud.it" style="color:#999999;text-decoration:underline;">EdiliziaInCloud</a>
        </td>
      </tr>
    `
    : "";

  const customFooter = branding.footerText
    ? `
      <tr>
        <td style="padding:0 24px 16px 24px;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#666666;line-height:1.5;">
          ${escapeHtml(branding.footerText)}
        </td>
      </tr>
    `
    : "";

  const preheader = preheaderText
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;">${escapeHtml(preheaderText)}</div>`
    : "";

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="it">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${escapeHtml(branding.companyName)}</title>
  <style type="text/css">
    /* Client-specific resets */
    body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
    img { -ms-interpolation-mode:bicubic; border:0; height:auto; line-height:100%; outline:none; text-decoration:none; }
    body { margin:0 !important; padding:0 !important; width:100% !important; background:#F5F7FA; }
    a { color:${branding.primaryColor}; }
    @media screen and (max-width:620px) {
      .container { width:100% !important; max-width:100% !important; }
      .px-24 { padding-left:16px !important; padding-right:16px !important; }
      .h-title { font-size:20px !important; line-height:28px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#F5F7FA;">
  ${preheader}
  <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="background:#F5F7FA;padding:24px 0;">
    <tr>
      <td align="center" valign="top">
        <table role="presentation" class="container" width="600" border="0" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#FFFFFF;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.05);">
          <!-- HEADER con logo -->
          <tr>
            <td class="px-24" style="padding:24px;border-bottom:3px solid ${branding.primaryColor};">
              ${logoBlock}
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td class="px-24" style="padding:32px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#333333;">
              ${innerBodyHtml}
            </td>
          </tr>

          <!-- CUSTOM FOOTER -->
          ${customFooter}

          <!-- MARKETING UNSUBSCRIBE (CAN-SPAM / GDPR) -->
          ${marketingFooter}

          <!-- POWERED BY EIC -->
          ${poweredBy}
        </table>

        <table role="presentation" width="600" border="0" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;margin-top:12px;">
          <tr>
            <td style="text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#999999;padding:0 24px;">
              &copy; ${new Date().getFullYear()} ${escapeHtml(branding.companyName)}. Tutti i diritti riservati.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Bottone CTA riutilizzabile (inline style per compatibilità Outlook VML).
 */
export function renderButton(params: {
  label: string;
  href: string;
  branding: Branding;
}): string {
  const { label, href, branding } = params;
  return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:24px 0;">
  <tr>
    <td align="center" bgcolor="${branding.primaryColor}" style="background:${branding.primaryColor};border-radius:6px;">
      <a href="${escapeHtml(href)}"
         style="display:inline-block;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:6px;">
        ${escapeHtml(label)}
      </a>
    </td>
  </tr>
</table>`;
}

/** Helper per produrre la versione testuale delle email (fallback text/plain). */
export function plainTextFooter(branding: Branding): string {
  const lines: string[] = [];
  if (branding.footerText) lines.push(branding.footerText);
  if (branding.unsubscribeUrl) {
    lines.push(`Annulla l'iscrizione: ${branding.unsubscribeUrl}`);
  }
  if (branding.showPoweredBy) {
    lines.push("Inviato con EdiliziaInCloud — https://ediliziaincloud.it");
  }
  return lines.join("\n");
}
