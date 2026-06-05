/**
 * brandEmailBody — avvolge il corpo di un'email nel layout brandizzato EiC.
 *
 * Unica fonte di verità condivisa tra l'invio reale (process-automation) e
 * l'anteprima/test (automation-email-render): così quello che vedi in anteprima
 * è ESATTAMENTE quello che arriva.
 *
 * Se `bodyHtml` è un frammento → lo avvolge nel layout (header logo/colori +
 * footer). Se è un documento HTML completo (<html>/<!doctype>) → lo lascia
 * intatto (niente doppio wrapper). Genera anche il plain-text per deliverability.
 * Best-effort: in caso di errore branding, ritorna il corpo grezzo.
 */
import { loadBranding } from "./renderTemplate.ts";
import { renderLayout, plainTextFooter } from "./email-templates/layout.ts";

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
  try {
    const branding = await loadBranding(companyId, adminClient);
    const html = renderLayout({ branding, innerBodyHtml: raw, preheaderText: preheader });
    return { html, text: `${text}\n\n${plainTextFooter(branding)}` };
  } catch (_e) {
    return { html: raw, text };
  }
}
