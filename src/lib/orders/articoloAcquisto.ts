/** Il prezzo di vendita non è un costo d’acquisto, e IVA zero è un valore valido. */
export function valoriArticoloAcquisto(t: {
  standard_cost: number;
  unit_of_measure?: string | null;
  vat_rate?: number | null;
}) {
  return {
    unit_price:
      Number.isFinite(Number(t.standard_cost)) && Number(t.standard_cost) > 0
        ? Number(t.standard_cost)
        : 0,
    unit_of_measure: t.unit_of_measure || "pz",
    vat_rate:
      t.vat_rate != null && Number.isFinite(Number(t.vat_rate))
        ? Number(t.vat_rate)
        : 22,
  };
}

export function totaliRigheOda(
  righe: Array<{
    quantity: number;
    unit_price: number;
    discount_percent: number;
    vat_rate: number;
    price_pending?: boolean;
  }>,
) {
  let imponibile = 0,
    iva = 0,
    daConfermare = 0;
  for (const r of righe) {
    if (r.price_pending) {
      daConfermare++;
      continue;
    }
    const netto =
      Math.round(
        Number(r.quantity) *
          Number(r.unit_price) *
          (1 - Number(r.discount_percent) / 100) *
          100,
      ) / 100;
    imponibile += netto;
    iva += Math.round(netto * Number(r.vat_rate)) / 100;
  }
  return {
    imponibile: Math.round(imponibile * 100) / 100,
    iva: Math.round(iva * 100) / 100,
    totale: Math.round((imponibile + iva) * 100) / 100,
    daConfermare,
  };
}
