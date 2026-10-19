/**
 * brandEmailBody — prepara il corpo di un'email delle automazioni per l'invio.
 *
 * Unica fonte di verità condivisa tra l'invio reale (process-automation) e
 * l'anteprima/test (automation-email-render): così quello che vedi in anteprima
 * è ESATTAMENTE quello che arriva.
 *
 * Stile Gmail per tutte (piattaforma e aziende clienti), come una email scritta a mano:
 * niente intestazione col nome o il logo, niente riquadro né colori da newsletter;
 * firma e riga per non ricevere più le email stanno già nel testo. Restano l'anteprima
 * nascosta e, se l'azienda l'ha impostato, il suo testo di piè di pagina in riga normale.
 *
 * Se `bodyHtml` è un documento HTML completo (<html>/<!doctype>) lo lascia intatto.
 * Genera anche il plain-text per la consegna. Se il branding non si legge, il
 * corpo parte comunque.
 */
import { loadBranding } from "./renderTemplate.ts";
import { escapeHtml } from "./email-templates/types.ts";

export async function brandEmailBody(
  // deno-lint-ignore no-explicit-any
  adminClient: any,
  companyId: string | null,
  bodyHtml: string,
  preheader: string,
): Promise<{ html: string; text: string }> {
  const raw = String(bodyHtml || "");
  const isFullDoc = /<!doctype|<html[\s>]/i.test(raw);
  const text = raw
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|h[1-6]|li|tr)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (isFullDoc) return { html: raw, text };

  return emailStileGmail(adminClient, companyId, raw, text, preheader);
}

async function emailStileGmail(
  // deno-lint-ignore no-explicit-any
  adminClient: any,
  companyId: string | null,
  raw: string,
  text: string,
  preheader: string,
): Promise<{ html: string; text: string }> {
  let footerText = "";
  try {
    const branding = await loadBranding(companyId, adminClient);
    footerText = String(branding?.footerText ?? "").trim();
  } catch (_e) {
    footerText = "";
  }
  const anteprima = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;">${escapeHtml(preheader)}</div>`
    : "";
  const piede = footerText ? `<div><br></div><div>${escapeHtml(footerText)}</div>` : "";
  const html = `<!DOCTYPE html>
<html lang="it">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body>
${anteprima}<div dir="ltr">${raw}${piede}</div>
</body>
</html>`;
  return { html, text: footerText ? `${text}\n\n${footerText}` : text };
}
