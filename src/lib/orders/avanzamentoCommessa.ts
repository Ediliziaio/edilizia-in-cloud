// src/lib/orders/avanzamentoCommessa.ts
/**
 * Come si pesano le fasi nella media della commessa (scelta dell'azienda). Il
 * numero lo calcola il database (recompute_order_progress, 20281007150000); qui
 * ci sono le scelte, e la regola con cui le schermate decidono quale numero mostrare.
 * Modulo puro.
 */
export type PesoMedia = "uguale" | "durata" | "venduto";

export const PESI_MEDIA: ReadonlyArray<{ valore: PesoMedia; etichetta: string; spiegazione: string }> = [
  { valore: "uguale", etichetta: "Alla pari", spiegazione: "Ogni fase conta come le altre." },
  { valore: "durata", etichetta: "Per durata", spiegazione: "Una fase lunga conta più di una breve. Servono le date di inizio e fine di tutte le fasi." },
  { valore: "venduto", etichetta: "Per importo venduto", spiegazione: "Una fase da 18.000 € conta più di una da 800 €. Serve il venduto di tutte le fasi." },
];

export function pesoMediaValido(v: unknown): PesoMedia {
  return v === "durata" || v === "venduto" ? v : "uguale";
}

/**
 * Quale avanzamento mostrare: con «alla pari» il calcolo di sempre della schermata
 * (decimali compresi); con un altro peso, il numero del database, se c'è.
 */
export function avanzamentoDaMostrare<T extends number | null>(
  locale: T,
  dalDatabase: { percentuale: number | null; peso: PesoMedia },
): T | number {
  if (dalDatabase.peso !== "uguale" && dalDatabase.percentuale != null) return dalDatabase.percentuale;
  return locale;
}
