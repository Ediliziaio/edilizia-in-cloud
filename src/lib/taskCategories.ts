/**
 * Categorie delle attività: UNA lista per tutta l'app.
 *
 * Fino al 2026-09-02 ne esistevano cinque diverse (Regia, riga, pannello,
 * statistiche, dialog) più una sesta "da ufficio" nella pagina staff: una task
 * creata come "Assistenza" o "Altro" non era filtrabile in Regia e compariva
 * col valore grezzo. Qui c'è l'unione, con le etichette che l'utente vede.
 */
export const TASK_CATEGORY_LABELS: Record<string, string> = {
  generale: "Generale",
  ordini: "Commesse",
  magazzino: "Magazzino",
  pagamenti: "Pagamenti",
  costi: "Costi",
  marketing: "Marketing",
  contatti: "Contatti",
  opportunita: "Opportunità",
  assistenza: "Assistenza",
  amministrazione: "Amministrazione",
  hr: "Risorse umane",
  contabilita: "Contabilità",
  commerciale: "Commerciale",
  logistica: "Logistica",
  altro: "Altro",
};

export const TASK_CATEGORY_OPTIONS: ReadonlyArray<{ value: string; label: string }> = Object.entries(
  TASK_CATEGORY_LABELS,
).map(([value, label]) => ({ value, label }));

/** Etichetta leggibile; un valore sconosciuto torna com'è, mai vuoto. */
export function etichettaCategoriaTask(value: string | null | undefined): string {
  if (!value) return TASK_CATEGORY_LABELS.generale;
  return TASK_CATEGORY_LABELS[value] ?? value;
}
