/**
 * A che punto è un rapportino, dal punto di vista di chi lo ha compilato.
 *
 * `stato` è la verità (bozza, inviato, approvato, rifiutato); `approvato` è il flag di prima, che resta solo
 * per i record vecchi senza `stato`. Un rapportino RIFIUTATO o rimasto in BOZZA non è consegnato: va rifatto.
 */
export type StatoRapportino = "bozza" | "inviato" | "approvato" | "rifiutato";

export function statoRapportino(r: { stato?: string | null; approvato?: boolean | null } | null | undefined): StatoRapportino | null {
  if (!r) return null;
  const raw = r.stato ?? (r.approvato ? "approvato" : "inviato");
  return raw === "inviato" || raw === "approvato" || raw === "rifiutato" ? raw : "bozza";
}

/** L'ufficio ce l'ha: inviato (da approvare) o già approvato. */
export const rapportinoConsegnato = (s: StatoRapportino | null): boolean => s === "inviato" || s === "approvato";

/** Da correggere e rimandare: respinto dall'ufficio, o mai inviato. */
export const rapportinoDaRifare = (s: StatoRapportino | null): boolean => s === "rifiutato" || s === "bozza";

export const ETICHETTA_STATO_OPERAIO: Record<StatoRapportino, string> = {
  bozza: "Bozza",
  inviato: "In attesa",
  approvato: "Approvato",
  rifiutato: "Respinto",
};
