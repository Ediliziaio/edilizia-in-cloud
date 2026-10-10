/**
 * I tre livelli di accesso che si danno a un commercialista, e cosa fa DAVVERO
 * ciascuno nel portale studio.
 *
 * Modulo puro: nessun React, nessun Supabase.
 */

export type AccessMode = "read_only" | "operational" | "approval_required";

// Cosa fa ogni livello DAVVERO nel portale studio (usePermissions.ts): «Operativo»
// sblocca la modifica di commesse, magazzino, clienti e ticket; gli altri due
// restano in sola lettura. Per «Con approvazione» la parte che manda le richieste
// non è ancora collegata a nessuna schermata del portale: lo diciamo.
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
    description: "Per ora guarda soltanto, come in «Solo lettura». Le modifiche che proporrà le approvi tu.",
  },
];
