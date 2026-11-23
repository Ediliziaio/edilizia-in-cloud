import type { Fotogramma } from "@/components/planimetrie/tred/fotogramma";

type FotogrammaDaCycles = { fotogramma: Fotogramma; pavimento?: string };
let inAttesa: (FotogrammaDaCycles & { percorso: string; id: string; scade: number }) | undefined;

/** Mantiene il PNG in memoria mentre si apre il configuratore della stessa stanza. */
export function preparaFotogrammaDaCycles(percorso: string, dati: FotogrammaDaCycles): string {
  const id = crypto.randomUUID();
  inAttesa = { ...dati, percorso, id, scade: Date.now() + 5 * 60_000 };
  return id;
}

export function leggiFotogrammaDaCycles(percorso: string, id: unknown): FotogrammaDaCycles | undefined {
  if (inAttesa && Date.now() >= inAttesa.scade) inAttesa = undefined;
  return inAttesa && inAttesa.percorso === percorso && inAttesa.id === id ? inAttesa : undefined;
}
