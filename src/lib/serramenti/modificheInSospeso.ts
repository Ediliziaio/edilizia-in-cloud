/**
 * I campi del preventivo modificati e non ancora salvati.
 *
 * L'autosave manda al database solo questi. Mandare tutto il modulo caricato
 * all'apertura riportava indietro lo stato cambiato dal menu e cancellava la
 * firma arrivata dal cliente nel frattempo.
 *
 * Ogni campo tiene l'ultimo valore scritto e un numero di versione: dopo un
 * salvataggio si tolgono solo i campi rimasti come quando era partito, così una
 * modifica fatta mentre si salvava non si perde.
 */
export type ModificheInSospeso<T> = Map<keyof T, { versione: number; valore: T[keyof T] | null }>;

/** Segna il nuovo valore di un campo. Un campo svuotato si salva come vuoto. */
export function segnaModifica<T, K extends keyof T>(
  modifiche: ModificheInSospeso<T>,
  campo: K,
  valore: T[K] | null | undefined,
): void {
  modifiche.set(campo, { versione: (modifiche.get(campo)?.versione ?? 0) + 1, valore: valore ?? null });
}

/** Il pezzo da salvare adesso e le versioni che contiene. */
export function modificheDaSalvare<T>(modifiche: ModificheInSospeso<T>): {
  patch: Partial<T>;
  versioni: Map<keyof T, number>;
} {
  const patch: Partial<T> = {};
  const versioni = new Map<keyof T, number>();
  for (const [campo, { versione, valore }] of modifiche) {
    patch[campo] = valore as T[keyof T];
    versioni.set(campo, versione);
  }
  return { patch, versioni };
}

/** Dopo il salvataggio restano da salvare solo i campi cambiati di nuovo nel frattempo. */
export function confermaSalvate<T>(modifiche: ModificheInSospeso<T>, versioni: Map<keyof T, number>): void {
  for (const [campo, versione] of versioni) {
    if (modifiche.get(campo)?.versione === versione) modifiche.delete(campo);
  }
}
