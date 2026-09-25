import { AREE_STANDARD, areaDiVerticale, nomeArea } from "@/lib/listino/areeStandard";

export type FiltroAreaTariffe = "all" | "current" | "global" | `area:${string}`;

/** I nomi storici e quelli del listino devono ritrovare la stessa area. */
export function tariffaNellArea(verticale: string | null | undefined, filtro: FiltroAreaTariffe, corrente?: string | null): boolean {
  const area = areaDiVerticale(verticale);
  if (filtro === "all") return true;
  if (filtro === "global") return area === null;
  if (filtro === "current") return area === areaDiVerticale(corrente);
  return area === filtro.slice(5);
}

/** Conserva anche i settori personalizzati già presenti nell'azienda. */
export function areePerTariffe(tariffe: ReadonlyArray<{ vertical_associato?: string | null }>) {
  const chiavi = new Set(AREE_STANDARD.map((a) => a.chiave));
  for (const tariffa of tariffe) {
    const chiave = areaDiVerticale(tariffa.vertical_associato);
    if (chiave) chiavi.add(chiave);
  }
  return [...chiavi].map((chiave) => ({ chiave, nome: nomeArea(chiave) }));
}
