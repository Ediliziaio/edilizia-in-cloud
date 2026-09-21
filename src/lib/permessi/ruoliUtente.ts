// ============================================================================
// ruoliUtente — ruolo principale e ruoli aggiuntivi di una persona
// ============================================================================
// In `user_roles` i ruoli di una persona sono un insieme: «Amministratore e
// anche Call Center» sono due righe. Per mostrarli si sceglie il PRINCIPALE, il
// più alto in questa classifica, e gli altri fra Venditore, Call Center e
// Operaio diventano «anche …».
//
// La stessa classifica sta nel database (`ruolo_principale_utente`, migration
// 20280921184500): cambia_ruolo_utente e imposta_ruolo_aggiuntivo ragionano
// così. Prima l'elenco utenti e la scheda utente avevano due classifiche
// diverse, e la stessa persona risultava «Operaio» da una parte e «Utente»
// dall'altra.
//
// Non è la classifica del login (`@/lib/roleHierarchy`): quella decide dove si
// atterra e divide gestionale e Area Campo; questa decide solo cosa si mostra
// e cosa si offre nelle impostazioni.
//
// Modulo puro: nessun React, nessun Supabase.
// ============================================================================

/** I ruoli d'azienda che si assegnano dalla scheda utente, dal più alto. */
export const ORDINE_RUOLO_PRINCIPALE = [
  "company_admin",
  "salesperson",
  "call_center",
  "company_staff",
  "employee",
  "subcontractor",
] as const;
export type RuoloAzienda = (typeof ORDINE_RUOLO_PRINCIPALE)[number];

/** I ruoli che una persona può avere «anche», oltre al principale. */
export const RUOLI_AGGIUNTIVI = ["salesperson", "call_center", "employee"] as const;
export type RuoloAggiuntivo = (typeof RUOLI_AGGIUNTIVI)[number];

/** `worker` è il vecchio nome di `employee`: nel database ne restano righe. */
function normalizza(ruolo: string): string {
  return ruolo === "worker" ? "employee" : ruolo;
}

/** Il ruolo principale fra quelli dell'utente; `undefined` se non ne ha. */
export function ruoloPrincipale(ruoli: readonly string[] | null | undefined): RuoloAzienda | undefined {
  const insieme = new Set((ruoli ?? []).map(normalizza));
  return ORDINE_RUOLO_PRINCIPALE.find((r) => insieme.has(r));
}

/** I ruoli «anche …» dell'utente: gli aggiuntivi che ha, meno il principale. */
export function ruoliAggiuntivi(
  ruoli: readonly string[] | null | undefined,
  principale: string | null | undefined,
): RuoloAggiuntivo[] {
  const insieme = new Set((ruoli ?? []).map(normalizza));
  return RUOLI_AGGIUNTIVI.filter((r) => r !== principale && insieme.has(r));
}

/**
 * Quali ruoli aggiuntivi si possono offrire a chi ha questo principale: tutti
 * tranne il principale stesso. Al Subappaltatore nessuno: è un'azienda
 * esterna, e il database li rifiuta.
 */
export function aggiuntiviDisponibili(principale: string | null | undefined): RuoloAggiuntivo[] {
  if (principale === "subcontractor") return [];
  return RUOLI_AGGIUNTIVI.filter((r) => r !== principale);
}

/** Come si chiama ogni ruolo aggiuntivo e cosa cambia per chi lo riceve. */
export const TESTI_RUOLO_AGGIUNTIVO: Record<RuoloAggiuntivo, { nome: string; cosaFa: string; tolto: string }> = {
  salesperson: {
    nome: "Venditore",
    cosaFa: "Compare nel calendario CRM, nell'elenco dei venditori e nelle provvigioni.",
    tolto: "Non compare più fra i venditori: lo storico resta.",
  },
  call_center: {
    nome: "Call Center",
    cosaFa: "Compare negli elenchi e negli appuntamenti del call center.",
    tolto: "Non compare più nel call center: lo storico resta.",
  },
  employee: {
    nome: "Operaio / Tecnico",
    cosaFa: "Entra anche nell'Area Campo: rapportini, timbrature e cantieri assegnati.",
    tolto: "Non entra più nell'Area Campo.",
  },
};
