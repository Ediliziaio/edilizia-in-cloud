/**
 * Costo dei materiali per la «Cassa della commessa», IVA inclusa: è quello che
 * esce davvero verso i fornitori, e si confronta con gli incassi, anch'essi
 * IVA inclusa. Il prezzo d'acquisto della riga è senza IVA: si porta a lordo
 * con l'aliquota della riga (22% quando la riga non la indica, come nel
 * modulo degli articoli; lo zero è un'aliquota valida). Modulo puro.
 */
export interface RigaMaterialeCassa {
  purchase_price?: number | string | null;
  quantity?: number | string | null;
  vat_rate?: number | string | null;
}

export function costoMaterialiIvato(righe: ReadonlyArray<RigaMaterialeCassa>): number {
  return righe.reduce((somma, r) => {
    const imponibile = (Number(r.purchase_price) || 0) * (Number(r.quantity) || 0);
    const aliquota = r.vat_rate == null || !Number.isFinite(Number(r.vat_rate)) ? 22 : Number(r.vat_rate);
    return somma + imponibile * (1 + aliquota / 100);
  }, 0);
}
