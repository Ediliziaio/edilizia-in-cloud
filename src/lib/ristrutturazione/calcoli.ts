const n = (x: unknown) => { const v = Number(x); return Number.isFinite(v) ? v : 0; };

export function calcRigaImporto(r: { quantita: number; prezzo_unitario: number; sconto_pct: number }): number {
  return Math.max(0, n(r.quantita)) * Math.max(0, n(r.prezzo_unitario)) * (1 - Math.min(100, Math.max(0, n(r.sconto_pct))) / 100);
}
export function calcPrezzoVoce(v: { costo_materiali: number; costo_manodopera: number; ricarico_pct: number }): number {
  return (Math.max(0, n(v.costo_materiali)) + Math.max(0, n(v.costo_manodopera))) * (1 + Math.max(0, n(v.ricarico_pct)) / 100);
}

/**
 * Stima delle superfici di lavorazione da: superficie calpestabile totale (mq),
 * altezza media (m) e numero di vani. Pavimenti/soffitti = superficie; le pareti
 * sono stimate assumendo vani ~quadrati (perimetro = 4×√area_vano) × altezza.
 * Tinteggiature = pareti + soffitti. Valori di stima, arrotondati al mq.
 */
export function stimaSuperficiVani(
  mqTotali: number,
  hMedia: number,
  nVani: number,
): { pavimenti: number; soffitti: number; pareti: number; tinteggiature: number } {
  const mq = Math.max(0, n(mqTotali));
  const h = Math.max(0, n(hMedia));
  const vani = Math.max(1, Math.floor(Math.max(0, n(nVani))) || 1);
  const areaVano = mq / vani;
  const paretiTot = Math.round(4 * Math.sqrt(areaVano) * h * vani);
  const pavimenti = Math.round(mq);
  const soffitti = Math.round(mq);
  return { pavimenti, soffitti, pareti: paretiTot, tinteggiature: paretiTot + soffitti };
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
