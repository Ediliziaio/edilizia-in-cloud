import { centesimi, euroDaCentesimi } from "@/lib/preventivi/arrotondamento";
const n = (x: unknown) => { const v = Number(x); return Number.isFinite(v) ? v : 0; };

/** Quantità × prezzo − sconto di riga, in euro e senza arrotondare. */
const importoGrezzo = (r: { quantita: number; prezzo_unitario: number; sconto_pct: number }) =>
  Math.max(0, n(r.quantita)) * Math.max(0, n(r.prezzo_unitario)) * (1 - Math.min(100, Math.max(0, n(r.sconto_pct))) / 100);

/**
 * Importo della riga al centesimo, come si stampa (06/10/2026): quantità × prezzo − sconto
 * di riga, arrotondato. Subtotali, imponibile, IVA e totale sono somme di questi centesimi, e
 * il PDF si somma riga per riga (vedi lib/preventivi/arrotondamento).
 */
export function calcRigaImporto(r: { quantita: number; prezzo_unitario: number; sconto_pct: number }): number {
  return euroDaCentesimi(centesimi(importoGrezzo(r)));
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

/** Costo per unità della riga: materiali + manodopera, mai negativo. */
const costoUnitario = (r: { costo_materiali: number; costo_manodopera: number }) =>
  Math.max(0, n(r.costo_materiali)) + Math.max(0, n(r.costo_manodopera));

/**
 * Margine di una riga: importo − costo per unità × quantità. Una riga venduta
 * senza costo non ha margine (null), non il 100% (05/10/2026); senza importo
 * non c'è la percentuale.
 */
export function calcMargineRiga(r: Omit<ComputoRigaInput, "capitolo_nome">): {
  margineEur: number | null;
  marginePct: number | null;
} {
  const importo = calcRigaImporto(r);
  const costo = costoUnitario(r);
  if (importo > 0 && costo <= 0) return { margineEur: null, marginePct: null };
  const margineEur = importo - costo * Math.max(0, n(r.quantita));
  return { margineEur, marginePct: importo > 0 ? (margineEur / importo) * 100 : null };
}

/**
 * Totali del preventivo. `prezzo_manuale`: il prezzo pieno scritto a mano in
 * Economia, IVA esclusa — prende il posto della somma delle righe, e sopra
 * lavorano sconto e IVA come sempre. Serve a chi usa il preventivatore per il
 * documento ma non carica i prezzi: le righe restano a 0 €. Vuoto o 0 = somma
 * delle righe. Il margine resta prezzo meno i costi di tutte le righe.
 *
 * Costi incompleti (05/10/2026): se una riga venduta non ha costo — col prezzo
 * scritto a mano, una riga qualsiasi con una quantità — il margine non si
 * conosce e `margineEur`/`marginePct` sono null, come nel fotovoltaico e nei
 * serramenti. Prima quella riga contava a costo zero e il margine saliva fino
 * al 100%. `righeSenzaCosto` dice quante sono; null anche senza costi del tutto.
 */
export function calcTotaliComputo(
  righe: ComputoRigaInput[],
  opts: { sconto_pct: number; iva_pct: number; prezzo_manuale?: number | null },
) {
  // I conti sono in centesimi interi (06/10/2026): ogni riga arrotondata, poi somme e differenze.
  // Prima restavano in virgola mobile e i numeri stampati nel PDF non tornavano di un centesimo.
  const byCap = new Map<string, { nome: string; imponibileC: number; costo: number; voci: number }>();
  const manuale = n(opts.prezzo_manuale);
  const prezzoManuale = manuale > 0;
  let sommaC = 0, costoTot = 0, righeSenzaCosto = 0;
  for (const r of righe) {
    const impC = centesimi(importoGrezzo(r));
    const costoUnit = costoUnitario(r);
    const costoRiga = costoUnit * Math.max(0, n(r.quantita));
    if ((impC > 0 || (prezzoManuale && n(r.quantita) > 0)) && costoUnit <= 0) righeSenzaCosto += 1;
    sommaC += impC; costoTot += costoRiga;
    const k = r.capitolo_nome || "Generale";
    const cur = byCap.get(k) ?? { nome: k, imponibileC: 0, costo: 0, voci: 0 };
    cur.imponibileC += impC; cur.costo += costoRiga; cur.voci += 1; byCap.set(k, cur);
  }
  // Prezzo pieno prima dello sconto globale: la somma delle righe o il prezzo scritto.
  const lordoC = prezzoManuale ? centesimi(manuale) : sommaC;
  const scontoGlobale = Math.min(100, Math.max(0, n(opts.sconto_pct))) / 100;
  // L'imponibile netto è il lordo scontato, arrotondato; il totale è lo stesso importo con l'IVA, arrotondato:
  // ogni cifra di totale si può raggiungere (lo «sconto veloce» arriva a una cifra tonda), mentre l'IVA è la
  // differenza e resta sempre entro 1 centesimo da aliquota × imponibile (la tolleranza dello SDI); senza sconto
  // coincide con quella stretta. Così imponibile + IVA = totale, e lordo − sconto = imponibile, a centesimi esatti.
  const nettoEsatto = euroDaCentesimi(lordoC) * (1 - scontoGlobale);
  const nettoC = centesimi(nettoEsatto);
  const totaleC = centesimi(nettoEsatto * (1 + Math.max(0, n(opts.iva_pct)) / 100));
  const ivaC = totaleC - nettoC;
  const imponibileLordo = euroDaCentesimi(lordoC);
  const imponibile = euroDaCentesimi(nettoC);
  const iva = euroDaCentesimi(ivaC);
  const totale = euroDaCentesimi(totaleC);
  const sommaVoci = euroDaCentesimi(sommaC);
  const costiCompleti = righeSenzaCosto === 0 && costoTot > 0;
  const margineEur: number | null = costiCompleti ? imponibile - costoTot : null;
  const marginePct: number | null = margineEur != null && imponibile > 0 ? (margineEur / imponibile) * 100 : null;
  return {
    imponibile, iva, totale, costoTot, margineEur, marginePct,
    perCapitolo: [...byCap.values()].map((c) => ({ nome: c.nome, imponibile: euroDaCentesimi(c.imponibileC), costo: c.costo, voci: c.voci })),
    imponibileLordo, sommaVoci, prezzoManuale, costiCompleti, righeSenzaCosto,
  };
}
