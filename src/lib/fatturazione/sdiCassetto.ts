// Predicati UI del Cassetto SDI. Rispecchiano la guardia server-side
// (supabase/functions/_shared/sdiInvioGuard.ts) così che il bottone "Reinvia"
// non offra azioni che la Edge Function poi rifiuterebbe.

/** sdi_stato che indicano una fattura già presa in carico/consegnata allo SDI. */
const SDI_STATO_GIA_TRASMESSA = ["AT", "RC", "DT", "EC"];

export interface DocCassetto {
  stato?: string | null;
  sdi_stato?: string | null;
}

/** True solo durante la trasmissione (claim atomico lato server). */
export function isInvioInCorso(doc: DocCassetto): boolean {
  return doc.stato === "in_invio";
}

/**
 * Una fattura è reinviabile SOLO se è stata scartata dallo SDI (notifica NS /
 * stato 'rifiutata') e non è in corso un invio. Le fatture già consegnate o
 * accettate (RC/AT/DT/EC) non si reinviano: si emette una nota di credito.
 */
export function puoReinviare(doc: DocCassetto): boolean {
  if (isInvioInCorso(doc)) return false;
  const sdi = (doc.sdi_stato ?? "").toUpperCase();
  if (SDI_STATO_GIA_TRASMESSA.includes(sdi)) return false;
  return doc.sdi_stato === "NS" || doc.stato === "rifiutata";
}
