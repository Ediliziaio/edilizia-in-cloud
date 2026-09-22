/**
 * Il mittente delle email dell'appuntamento, calendario per calendario
 * (22/09/2026).
 *
 * Conferma, promemoria, spostamento e disdetta partivano dal mittente di
 * riserva della piattaforma («EdiliziaInCloud <no-reply@notifiche…>»). Un
 * calendario può ora avere nome e indirizzo propri («Filippo di
 * EdiliziaInCloud <flo@mkt.ediliziaincloud.com>»), purché il dominio sia
 * attivo e verificato nella scheda Dominio email dell'azienda: un indirizzo
 * scritto a mano su un dominio non verificato verrebbe rifiutato, e si resta
 * sul mittente di sempre.
 *
 * I domini dell'azienda sono verificati su Elastic Email (il provider del
 * marketing): per questo l'email esce da lì, con la classe transazionale
 * (viaMarketingProvider in sendEmailUnified). Le risposte del cliente usano
 * l'indirizzo tracciato del contatto e rientrano nel gestionale come quelle
 * ai flussi.
 */

// deno-lint-ignore-file no-explicit-any

import { getReplyAddress } from "./replyRoutes.ts";
import { mittenteDelCalendario, type CalendarioConMittente, type DominioEmail } from "./mittenteCalendarioRegola.ts";

export { mittenteDelCalendario, type CalendarioConMittente, type DominioEmail };

/**
 * Le opzioni da aggiungere a sendEmailUnified: {} se il calendario non ha un
 * mittente valido (si resta sul mittente della piattaforma, come prima).
 * `alCliente`: le email al cliente rispondono all'indirizzo tracciato del
 * contatto; gli avvisi al titolare tengono il loro Reply-To (il cliente).
 */
export async function opzioniMittenteCalendario(
  admin: any,
  cal: CalendarioConMittente | null | undefined,
  contattoId: string | null | undefined,
  alCliente = true,
): Promise<Record<string, unknown>> {
  if (!cal?.mittente_email) return {};
  try {
    const { data } = await admin
      .from("company_email_domains")
      .select("domain, is_active, ee_spf_verified, ee_dkim_verified")
      .eq("company_id", cal.company_id);
    const m = mittenteDelCalendario(cal, (data ?? []) as DominioEmail[]);
    if (!m) return {};
    const replyTo = alCliente && contattoId ? await getReplyAddress(admin, cal.company_id, contattoId) : null;
    return {
      senderOverride: {
        from: m.from,
        ...(replyTo ? { replyTo } : {}),
        customDomain: m.dominio,
        usingCustomDomain: true,
        source: "mittente_calendario",
      },
      viaMarketingProvider: true,
    };
  } catch {
    // Il mittente non deve mai bloccare una conferma: si resta su quello di sempre.
    return {};
  }
}
