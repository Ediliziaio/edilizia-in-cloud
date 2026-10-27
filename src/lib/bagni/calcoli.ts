export * from "@/lib/preventivi/calcoliComputo";

const n = (x: unknown) => { const v = Number(x); return Number.isFinite(v) ? v : 0; };

/**
 * Superfici per il computo del bagno:
 *  - pavimento = superficie del bagno (mq)
 *  - rivestimento pareti = perimetro × altezza di rivestimento (mq, lordo aperture)
 * Valori arrotondati a 0,1 mq, da usare nelle voci pavimento/rivestimento del computo.
 */
export function calcRivestimenti(
  pavimentoMq: number,
  perimetroMl: number,
  hRivestimento: number,
): { pavimento_mq: number; rivestimento_mq: number } {
  const pav = Math.max(0, n(pavimentoMq));
  const per = Math.max(0, n(perimetroMl));
  const h = Math.max(0, n(hRivestimento));
  return {
    pavimento_mq: Math.round(pav * 10) / 10,
    rivestimento_mq: Math.round(per * h * 10) / 10,
  };
}
