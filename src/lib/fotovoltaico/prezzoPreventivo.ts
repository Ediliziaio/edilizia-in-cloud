/**
 * Il prezzo del preventivo fotovoltaico, come lo calcola il server.
 *
 * Il prezzo finale (e con lui IVA, margine, incentivi, rata) lo scrive il calcolo
 * finanziario (`fv-calcolo-finanziario`) sulle righe salvate: finora chi preparava il
 * preventivo lo vedeva solo dopo la Fase 6. Questa funzione PURA ripete la parte di
 * prezzo di quel calcolo sullo stato del wizard, così il totale si vede mentre si
 * scrive (anteprima a destra).
 *
 * È una COPIA di `supabase/functions/fv-calcolo-finanziario/index.ts` (sezioni 2, 2a,
 * 2b): se lì cambia la formula, cambia anche qui. Un test legge la funzione del server
 * e fallisce se le formule che ripetiamo non ci sono più.
 */

export interface RigaComponentePrezzoFv {
  quantita: number;
  prezzo_unitario_vendita: number;
  prezzo_unitario_netto: number;
}

export interface RigaManodoperaPrezzoFv {
  ore: number;
  tariffa_oraria_vendita: number;
  tariffa_oraria_netta: number;
}

export interface RigaServizioPrezzoFv {
  quantita: number;
  prezzo_vendita: number;
  prezzo_netto: number;
}

export interface InputPrezzoFv {
  componenti: RigaComponentePrezzoFv[];
  manodopera: RigaManodoperaPrezzoFv[];
  servizi: RigaServizioPrezzoFv[];
  /** Prezzo a corpo, imponibile: sostituisce la somma delle righe e lo sconto non vale. null = dalle righe. */
  prezzoManuale: number | null;
  sconto: { tipo: "pct" | "importo" | null; valore: number | null };
  /** Massimo sconto consentito dalle regole aziendali, in % (`evaluateDiscountRules(...).scontoMaxPct`). */
  scontoMaxPct: number;
  /** Margine minimo in % che lo sconto non può intaccare (`evaluateDiscountRules(...).margineMinPct`). */
  margineMinPct: number;
  /** Aliquota IVA come frazione: 0,10 = 10%. */
  ivaAliquota: number;
}

export interface PrezzoFv {
  /** Somma dei componenti a prezzo di vendita: 0 = listino senza prezzi. */
  costoComponentiVendita: number;
  /** Prezzo pieno prima dello sconto (IVA esclusa). */
  prezzoPieno: number;
  /** Costo d'acquisto di tutte le righe. */
  costoNetto: number;
  /** Una riga venduta senza costo (o nessun costo): il margine non si conosce. */
  costiIncompleti: boolean;
  righeSenzaCosto: number;
  usaPrezzoManuale: boolean;
  scontoRichiesto: number;
  scontoApplicato: number;
  scontoLimitato: boolean;
  /** Imponibile finale: prezzo scritto a mano, o prezzo pieno meno lo sconto. */
  imponibile: number;
  ivaImporto: number;
  /** Totale IVA inclusa. */
  totale: number;
  /** null quando i costi sono incompleti. */
  margineEur: number | null;
  /** In % (0-100); null quando i costi sono incompleti o non c'è imponibile. */
  marginePct: number | null;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const num = (x: unknown): number => {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
};

export function calcolaPrezzoFv(input: InputPrezzoFv): PrezzoFv {
  const { componenti, manodopera, servizi } = input;

  const costoComponentiNetto = componenti.reduce((s, c) => s + num(c.quantita) * num(c.prezzo_unitario_netto), 0);
  const costoComponentiVendita = componenti.reduce((s, c) => s + num(c.quantita) * num(c.prezzo_unitario_vendita), 0);
  const costoManodoperaNetto = manodopera.reduce((s, m) => s + num(m.ore) * num(m.tariffa_oraria_netta), 0);
  const costoManodoperaVendita = manodopera.reduce((s, m) => s + num(m.ore) * num(m.tariffa_oraria_vendita), 0);
  const costoServiziNetto = servizi.reduce((s, x) => s + num(x.prezzo_netto) * num(x.quantita), 0);
  const costoServiziVendita = servizi.reduce((s, x) => s + num(x.prezzo_vendita) * num(x.quantita), 0);

  const costoNetto = costoComponentiNetto + costoManodoperaNetto + costoServiziNetto;
  const prezzoPieno = costoComponentiVendita + costoManodoperaVendita + costoServiziVendita;

  // Costi d'acquisto mancanti: un componente senza costo (listino senza prezzi, kit,
  // prezzo a corpo) o una riga venduta senza costo. Il margine allora non si conosce.
  const senzaCosto = (vendita: unknown, netto: unknown) => num(vendita) > 0 && !(num(netto) > 0);
  const compSenzaCosto = componenti.filter((c) => num(c.quantita) > 0 && !(num(c.prezzo_unitario_netto) > 0)).length;
  const manoSenzaCosto = manodopera.filter((m) => senzaCosto(m.tariffa_oraria_vendita, m.tariffa_oraria_netta)).length;
  const servSenzaCosto = servizi.filter((x) => senzaCosto(x.prezzo_vendita, x.prezzo_netto)).length;
  const righeSenzaCosto = compSenzaCosto + manoSenzaCosto + servSenzaCosto;
  const costiIncompleti = costoNetto <= 0 || righeSenzaCosto > 0;

  // Prezzo di vendita LIBERO a corpo: è il prezzo finale, e lo sconto non si applica.
  const manuale = num(input.prezzoManuale);
  const usaPrezzoManuale = manuale > 0;

  // Sconto commerciale: richiesto, poi limitato dalle regole aziendali e, con i costi
  // veri, dal margine minimo ((P − s − C) / (P − s) ≥ m  →  s ≤ P − C/(1−m)).
  const scontoValore = num(input.sconto.valore);
  const scontoRichiesto = scontoValore > 0
    ? (input.sconto.tipo === "pct" ? prezzoPieno * (scontoValore / 100) : scontoValore)
    : 0;
  const capRegoleEur = prezzoPieno * (input.scontoMaxPct / 100);
  const capMargineEur = costiIncompleti
    ? capRegoleEur
    : input.margineMinPct < 100
      ? Math.max(0, prezzoPieno - costoNetto / (1 - input.margineMinPct / 100))
      : 0;
  const scontoCapEur = Math.max(0, Math.min(capRegoleEur, capMargineEur));
  const scontoApplicato = usaPrezzoManuale ? 0 : round2(Math.min(scontoRichiesto, scontoCapEur));
  const scontoLimitato = usaPrezzoManuale ? false : scontoRichiesto > scontoApplicato + 0.005;

  const imponibile = usaPrezzoManuale ? round2(manuale) : round2(prezzoPieno - scontoApplicato);
  const totale = round2(imponibile * (1 + input.ivaAliquota));
  const margineEur = costiIncompleti ? null : imponibile - costoNetto;
  const marginePct = margineEur != null && imponibile > 0 ? (margineEur / imponibile) * 100 : null;

  return {
    costoComponentiVendita,
    prezzoPieno,
    costoNetto,
    costiIncompleti,
    righeSenzaCosto,
    usaPrezzoManuale,
    scontoRichiesto,
    scontoApplicato,
    scontoLimitato,
    imponibile,
    ivaImporto: round2(totale - imponibile),
    totale,
    margineEur,
    marginePct,
  };
}
