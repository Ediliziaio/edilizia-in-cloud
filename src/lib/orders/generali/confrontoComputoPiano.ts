/**
 * Computo dalla pianta contro business plan (24/11/2026): sulla Panoramica di un'operazione
 * immobiliare il titolare vede subito se le opere previste nel piano reggono il computo.
 * Le voci del piano che contano sono i costi di costruzione e di manodopera di cantiere.
 */
export const CATEGORIE_OPERE = ["costruzione", "manodopera"] as const;

export interface ConfrontoComputoPiano {
  computo: number;
  piano: number;
  differenza: number;
  /** Differenza sul piano, in percento; null se il piano non ha opere. */
  percento: number | null;
}

export function confrontoComputoPiano(
  totaleComputo: number,
  voci: readonly { tipo: string; categoria: string | null; importo: number | null }[],
): ConfrontoComputoPiano | null {
  if (!(totaleComputo > 0)) return null;
  const piano = voci.filter((v) => v.tipo === "costo" && (CATEGORIE_OPERE as readonly string[]).includes(v.categoria ?? ""))
    .reduce((s, v) => s + (Number.isFinite(v.importo) ? Number(v.importo) : 0), 0);
  const differenza = Math.round((totaleComputo - piano) * 100) / 100;
  return { computo: totaleComputo, piano, differenza, percento: piano > 0 ? Math.round(differenza / piano * 1000) / 10 : null };
}
