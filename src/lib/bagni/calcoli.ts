const n = (x: unknown) => { const v = Number(x); return Number.isFinite(v) ? v : 0; };

export function calcRigaImporto(r: { quantita: number; prezzo_unitario: number; sconto_pct: number }): number {
  return Math.max(0, n(r.quantita)) * Math.max(0, n(r.prezzo_unitario)) * (1 - Math.min(100, Math.max(0, n(r.sconto_pct))) / 100);
}
export function calcPrezzoVoce(v: { costo_materiali: number; costo_manodopera: number; ricarico_pct: number }): number {
  return (Math.max(0, n(v.costo_materiali)) + Math.max(0, n(v.costo_manodopera))) * (1 + Math.max(0, n(v.ricarico_pct)) / 100);
}

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
export interface ComputoRigaInput {
  capitolo_nome: string; quantita: number; prezzo_unitario: number; sconto_pct: number;
  costo_materiali: number; costo_manodopera: number;
}
export function calcTotaliComputo(righe: ComputoRigaInput[], opts: { sconto_pct: number; iva_pct: number }) {
  const byCap = new Map<string, { nome: string; imponibile: number; costo: number; voci: number }>();
  let imponibile = 0, costoTot = 0;
  for (const r of righe) {
    const imp = calcRigaImporto(r);
    const costoRiga = (Math.max(0, n(r.costo_materiali)) + Math.max(0, n(r.costo_manodopera))) * Math.max(0, n(r.quantita));
    imponibile += imp; costoTot += costoRiga;
    const k = r.capitolo_nome || "Generale";
    const cur = byCap.get(k) ?? { nome: k, imponibile: 0, costo: 0, voci: 0 };
    cur.imponibile += imp; cur.costo += costoRiga; cur.voci += 1; byCap.set(k, cur);
  }
  const scontoGlobale = Math.min(100, Math.max(0, n(opts.sconto_pct))) / 100;
  imponibile = imponibile * (1 - scontoGlobale);
  const iva = imponibile * Math.max(0, n(opts.iva_pct)) / 100;
  const totale = imponibile + iva;
  const margineEur = imponibile - costoTot;
  const marginePct = imponibile > 0 ? (margineEur / imponibile) * 100 : 0;
  return { imponibile, iva, totale, costoTot, margineEur, marginePct, perCapitolo: [...byCap.values()] };
}
