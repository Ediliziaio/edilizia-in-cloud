/**
 * Source of truth per invalidare TUTTE le query React Query che leggono
 * `tariffe_aziendali` o sue varianti.
 *
 * Problema risolto: la tabella `tariffe_aziendali` veniva letta con 5 chiavi
 * diverse sparse nel codice (admin, family editor, picker preventivo, costi
 * preventivo, catalog articolo, fotovoltaico). Quando l'admin aggiornava
 * una tariffa in /azienda/impostazioni/tariffe, SOLO la sua queryKey
 * (`tariffe-aziendali-full`) veniva invalidata → le altre 4 restavano
 * stale e l'utente vedeva tariffe vecchie nel FamilyEditor o nel picker.
 *
 * Soluzione: chiamare `invalidateAllTariffe(qc)` dopo ogni mutation su
 * tariffe_aziendali. Invalida tutte le chiavi conosciute con una predicate
 * generica (catch-all) + invalida esplicitamente quelle critiche per
 * sicurezza in caso di nuove chiavi non standardizzate.
 */
import type { QueryClient } from "@tanstack/react-query";

/**
 * Chiavi note che leggono dalla tabella `tariffe_aziendali` (o usano le
 * tariffe come dato derivato). Le elenchiamo esplicitamente per autodoc.
 */
export const TARIFFE_QUERY_KEYS = [
  // Pannello admin /azienda/impostazioni/tariffe (SettingsTariffe)
  ["tariffe-aziendali-full"],
  // Form anagrafica articolo (FamilyEditor step 4 Manodopera)
  ["tariffe-for-editor"],
  // Picker preventivo serramenti (ListinoPickerDialog) + ServiziSection
  ["sr-tariffe-manodopera"],
  // Calcolo costi preventivo + ArticleCatalog
  ["tariffe-aziendali"],
  // Modulo fotovoltaico
  ["tariffe"],
] as const;

/**
 * Invalida tutte le query React Query che leggono dalle tariffe aziendali.
 *
 * Strategia doppia:
 *  1. Invalida esplicitamente ognuna delle chiavi note (parziale match —
 *     React Query invalida tutte le query la cui chiave inizia con quella
 *     passata, quindi `["tariffe-for-editor", companyId]` viene preso
 *     anche se passiamo `["tariffe-for-editor"]`).
 *  2. Predicate catch-all su qualunque chiave che inizia con "tariff" —
 *     copre eventuali nuove chiavi non ancora aggiunte alla lista esplicita.
 *
 * `void` perché tutte le invalidateQueries sono fire-and-forget; il
 * caller non aspetta il completamento (il toast.success è già stato
 * mostrato dalla mutation onSuccess).
 */
export function invalidateAllTariffe(qc: QueryClient): void {
  // 1. Esplicite (autodoc, sicurezza)
  TARIFFE_QUERY_KEYS.forEach((key) => {
    void qc.invalidateQueries({ queryKey: [...key] });
  });
  // 2. Catch-all per chiavi nuove o varianti (es. "tariffa-costi-varianti")
  void qc.invalidateQueries({
    predicate: (q) => {
      const k = q.queryKey;
      if (!Array.isArray(k) || k.length === 0) return false;
      const first = k[0];
      return typeof first === "string" && /^tariff/i.test(first);
    },
  });
}
