const n = (x: unknown) => { const v = Number(x); return Number.isFinite(v) ? v : 0; };

export function calcRigaImporto(r: { quantita: number; prezzo_unitario: number; sconto_pct: number }): number {
  return Math.max(0, n(r.quantita)) * Math.max(0, n(r.prezzo_unitario)) * (1 - Math.min(100, Math.max(0, n(r.sconto_pct))) / 100);
}
export function calcPrezzoVoce(v: { costo_materiali: number; costo_manodopera: number; ricarico_pct: number }): number {
  return (Math.max(0, n(v.costo_materiali)) + Math.max(0, n(v.costo_manodopera))) * (1 + Math.max(0, n(v.ricarico_pct)) / 100);
}

/**
 * Superficie REALE di falda a partire dalla superficie in pianta (footprint) e
 * dalla pendenza in %. La falda inclinata è più grande della proiezione in pianta:
 * area_falda = area_pianta / cos(α) = area_pianta × √(1 + (pendenza/100)²).
 * Es. 100 mq in pianta + 30% di pendenza → 104,4 mq di falda.
 */
export function calcSuperficieFalda(piantaMq: number, pendenzaPct: number): number {
  const p = Math.max(0, n(piantaMq));
  const pend = Math.max(0, n(pendenzaPct)) / 100;
  return p * Math.sqrt(1 + pend * pend);
}

/**
 * Stima della lattoneria dal perimetro dell'edificio (ml): i canali di gronda
 * corrono lungo il perimetro; i pluviali si stimano ~1 ogni 12 ml di gronda (min 2).
 * Valori di partenza editabili nel computo.
 */
export function stimaLattoneria(perimetroMl: number): { gronde_ml: number; pluviali_n: number } {
  const per = Math.max(0, n(perimetroMl));
  return { gronde_ml: Math.round(per), pluviali_n: per > 0 ? Math.max(2, Math.ceil(per / 12)) : 0 };
}
export interface ComputoRigaInput {
  capitolo_nome: string; quantita: number; prezzo_unitario: number; sconto_pct: number;
  costo_materiali: number; costo_manodopera: number;
}
/**
 * Totali del preventivo. `prezzo_manuale`: il prezzo pieno scritto a mano in
 * Economia, IVA esclusa — prende il posto della somma delle righe, e sopra
 * lavorano sconto e IVA come sempre. Serve a chi usa il preventivatore per il
 * documento ma non carica i prezzi: le righe restano a 0 €. Vuoto o 0 = somma
 * delle righe. Il margine resta prezzo meno i costi di tutte le righe.
 */
export function calcTotaliComputo(
  righe: ComputoRigaInput[],
  opts: { sconto_pct: number; iva_pct: number; prezzo_manuale?: number | null },
) {
  const byCap = new Map<string, { nome: string; imponibile: number; costo: number; voci: number }>();
  let sommaVoci = 0, costoTot = 0;
  for (const r of righe) {
    const imp = calcRigaImporto(r);
    const costoRiga = (Math.max(0, n(r.costo_materiali)) + Math.max(0, n(r.costo_manodopera))) * Math.max(0, n(r.quantita));
    sommaVoci += imp; costoTot += costoRiga;
    const k = r.capitolo_nome || "Generale";
    const cur = byCap.get(k) ?? { nome: k, imponibile: 0, costo: 0, voci: 0 };
    cur.imponibile += imp; cur.costo += costoRiga; cur.voci += 1; byCap.set(k, cur);
  }
  const manuale = n(opts.prezzo_manuale);
  const prezzoManuale = manuale > 0;
  // Prezzo pieno prima dello sconto globale: la somma delle righe o il prezzo scritto.
  const imponibileLordo = prezzoManuale ? manuale : sommaVoci;
  const scontoGlobale = Math.min(100, Math.max(0, n(opts.sconto_pct))) / 100;
  const imponibile = imponibileLordo * (1 - scontoGlobale);
  const iva = imponibile * Math.max(0, n(opts.iva_pct)) / 100;
  const totale = imponibile + iva;
  const margineEur = imponibile - costoTot;
  const marginePct = imponibile > 0 ? (margineEur / imponibile) * 100 : 0;
  return {
    imponibile, iva, totale, costoTot, margineEur, marginePct, perCapitolo: [...byCap.values()],
    imponibileLordo, sommaVoci, prezzoManuale,
  };
}
