import type { VoceSim, ScenariConfig, RiepilogoIvaRiga } from "./tipi";

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export function calcolaVoce(v: VoceSim) {
  const imponibile_costo = round2(v.quantita * v.costo_unitario);
  const imponibile_ricavo = round2(v.quantita * v.prezzo_unitario);
  return { imponibile_costo, imponibile_ricavo, margine: round2(imponibile_ricavo - imponibile_costo) };
}

export function calcolaTotali(voci: VoceSim[]) {
  let costo_totale = 0, ricavo_imponibile = 0;
  for (const v of voci) {
    const r = calcolaVoce(v);
    costo_totale += r.imponibile_costo;
    ricavo_imponibile += r.imponibile_ricavo;
  }
  costo_totale = round2(costo_totale);
  ricavo_imponibile = round2(ricavo_imponibile);
  const margine_valore = round2(ricavo_imponibile - costo_totale);
  const margine_pct = ricavo_imponibile > 0 ? round2((margine_valore / ricavo_imponibile) * 100) : 0;
  return { costo_totale, ricavo_imponibile, margine_valore, margine_pct };
}

/**
 * calcolaIva — riepilogo IVA dell'imponibile ricavo, per aliquota.
 *
 * - `iva_mode === "singola"`: tutto l'imponibile ricavo a `iva_rate_singola`,
 *   un'unica riga di riepilogo.
 * - `iva_mode === "mista"`: accumula per `vat_rate` di riga. Per le voci con
 *   `bene_significativo`, applica la regola dei beni significativi: con
 *   `B = imponibile_ricavo` e `posa = valore_posa_associata ?? 0`, si aggiunge
 *   `posa + min(B, posa)` all'aliquota agevolata 10% e `max(0, B − posa)` al 22%
 *   (invece di tutto B alla sua `vat_rate`).
 *
 * Per ogni riga di riepilogo `imposta = round2(imponibile × aliquota / 100)`,
 * ordinata per aliquota crescente; `iva_totale = round2(somma imposte)`.
 */
export function calcolaIva(
  voci: VoceSim[],
  scenari: ScenariConfig,
): { riepilogo_iva: RiepilogoIvaRiga[]; iva_totale: number } {
  // Imponibile ricavo accumulato per aliquota.
  const perAliquota = new Map<number, number>();
  const add = (aliquota: number, imponibile: number) => {
    if (imponibile === 0) return;
    perAliquota.set(aliquota, round2((perAliquota.get(aliquota) ?? 0) + imponibile));
  };

  if (scenari.iva_mode === "singola") {
    const { ricavo_imponibile } = calcolaTotali(voci);
    perAliquota.set(scenari.iva_rate_singola, ricavo_imponibile);
  } else {
    for (const v of voci) {
      const { imponibile_ricavo: B } = calcolaVoce(v);
      if (v.bene_significativo) {
        const posa = v.valore_posa_associata ?? 0;
        add(10, round2(posa + Math.min(B, posa)));
        add(22, round2(Math.max(0, B - posa)));
      } else {
        add(v.vat_rate, B);
      }
    }
  }

  const riepilogo_iva: RiepilogoIvaRiga[] = [...perAliquota.entries()]
    .map(([aliquota, imponibile]) => ({
      aliquota,
      imponibile: round2(imponibile),
      imposta: round2((imponibile * aliquota) / 100),
    }))
    .sort((a, b) => a.aliquota - b.aliquota);

  const iva_totale = round2(riepilogo_iva.reduce((acc, r) => acc + r.imposta, 0));
  return { riepilogo_iva, iva_totale };
}
