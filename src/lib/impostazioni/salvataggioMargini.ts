/** Aggiorna soltanto i campi cambiati, senza riscrivere opzioni modificate altrove. */
export function campiMarginiModificati<T extends Record<string, unknown>>(next: T, original: Partial<T>): Partial<T> {
  return Object.fromEntries(Object.entries(next).filter(([key, value]) => !Object.is(value, original[key]))) as Partial<T>;
}

export function percentualeImpostazione(value: string, label: string, max = 100): number | null {
  if (!value.trim()) return null;
  const numero = Number(value.trim().replace(",", "."));
  if (!Number.isFinite(numero) || numero < 0 || numero > max) {
    throw new Error(`${label}: inserisci una percentuale tra 0 e ${max}.`);
  }
  return numero;
}
