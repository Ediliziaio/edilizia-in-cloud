// src/lib/orders/salMaturazione.ts
/**
 * Quando matura la rata di un SAL (07/10/2026): lo sceglie l'azienda. «Emesso»: appena il verbale
 * non è più una bozza, è il momento di fatturare. «Approvato»: quando il cliente lo approva o lo
 * firma (con il link di firma). La stessa regola vive in SQL (`sal_matura`): se cambia qui, cambia là.
 */
export type SalMatura = "emesso" | "approvato";

export const SAL_MATURA: ReadonlyArray<{ valore: SalMatura; etichetta: string; spiegazione: string }> = [
  {
    valore: "emesso", etichetta: "Quando emetto il verbale",
    spiegazione: "Appena il verbale non è più una bozza la rata «al SAL» è da incassare: è il momento di fatturare.",
  },
  {
    valore: "approvato", etichetta: "Quando il cliente lo approva o lo firma",
    spiegazione: "La rata aspetta che il verbale sia approvato dal cliente o firmato con il link di firma.",
  },
];

/** Un valore che non si riconosce (colonna non ancora creata, lettura fallita) vale «emesso», come di partenza. */
export function salMaturaValido(valore: unknown): SalMatura {
  return valore === "approvato" ? "approvato" : "emesso";
}

/** Un verbale è maturato quando il suo stato ha raggiunto quello scelto dall'azienda. */
export function salMaturato(regola: SalMatura, stato: string): boolean {
  return regola === "approvato" ? stato === "approvato" || stato === "firmato" : stato !== "bozza";
}
