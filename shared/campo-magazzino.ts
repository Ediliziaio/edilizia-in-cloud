export const LIVELLI_MAGAZZINO_CAMPO = ["nessuno", "inventario", "prelievi"] as const;

export type LivelloMagazzinoCampo = typeof LIVELLI_MAGAZZINO_CAMPO[number];

export const ETICHETTE_MAGAZZINO_CAMPO: Record<LivelloMagazzinoCampo, string> = {
  nessuno: "Nessun accesso",
  inventario: "Solo inventario",
  prelievi: "Inventario e prelievi",
};

export function livelloMagazzinoCampo(value: unknown): LivelloMagazzinoCampo | null {
  return LIVELLI_MAGAZZINO_CAMPO.find((livello) => livello === value) ?? null;
}
