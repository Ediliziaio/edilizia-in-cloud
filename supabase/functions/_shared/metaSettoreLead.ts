/**
 * Il settore dichiarato nel modulo Facebook (19/09/2026).
 *
 * «Tra le domande del lead form c'è anche il settore di appartenenza, che è
 * importante»: la risposta finiva solo nel riepilogo testuale delle note, e
 * nel kanban non si vedeva. Qui si riconosce la domanda qualunque sia la
 * formulazione del modulo («Settore di appartenenza», «In che settore
 * lavori?», «settore_attivita»…) e si ripulisce la risposta, così il lead la
 * porta sul contatto (campo «Settore», se l'azienda ce l'ha) e nel trigger
 * delle automazioni ({{settore}} nel nome dell'opportunità).
 *
 * Modulo puro: provato in src/test/logic/metaSettoreLead.test.ts.
 */

/** Chiave confrontabile: minuscole, senza accenti né simboli. */
function normalizza(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_");
}

/** La risposta alla domanda sul settore, in chiaro («serramenti_e_infissi» → «Serramenti e infissi»). */
export function settoreDaRisposte(risposte: Record<string, unknown> | null | undefined): string | null {
  for (const [domanda, valore] of Object.entries(risposte ?? {})) {
    const chiave = normalizza(domanda);
    if (!/(^|_)(settore|settori|sector)(_|$)/.test(chiave)) continue;
    const grezzo = Array.isArray(valore) ? valore.filter(Boolean).join(", ") : String(valore ?? "");
    const pulito = grezzo.replace(/_/g, " ").replace(/\s+/g, " ").trim();
    if (!pulito) continue;
    return pulito.charAt(0).toUpperCase() + pulito.slice(1);
  }
  return null;
}

/** Il campo personalizzato «Settore» dell'azienda, se c'è. */
export function campoSettore(campi: Array<{ id: string; name: string | null }> | null | undefined): string | null {
  const trovato = (campi ?? []).find((c) => normalizza(String(c.name ?? "")).replace(/^_+|_+$/g, "") === "settore");
  return trovato?.id ?? null;
}
