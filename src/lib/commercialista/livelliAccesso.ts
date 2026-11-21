/**
 * I tre livelli di accesso che si danno a un commercialista, e cosa fa DAVVERO
 * ciascuno nel portale studio.
 *
 * Modulo puro: nessun React, nessun Supabase.
 */

export type AccessMode = "read_only" | "operational" | "approval_required";

// Cosa fa ogni livello DAVVERO nel portale studio (usePermissions.ts): «Operativo»
// sblocca la modifica di commesse, magazzino, clienti e ticket.
export const ACCESS_MODE_OPTIONS: Array<{ value: AccessMode; label: string; description: string }> = [
  {
    value: "read_only",
    label: "Solo lettura",
    description: "Guarda i dati e non cambia niente.",
  },
  {
    value: "operational",
    label: "Operativo",
    description: "Può modificare commesse, magazzino, clienti e ticket.",
  },
  {
    value: "approval_required",
    label: "Con approvazione",
    description: "Consulta i dati e invia proposte di modifica. L’azienda decide quali approvare.",
  },
];
