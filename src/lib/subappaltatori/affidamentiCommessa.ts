/**
 * «Chi fa cosa» (10/11/2026, lotto 4 di docs/piano-subappalto-computo-listino.md): i conti della vista.
 *
 * Una voce della commessa si affida a una o più ditte per quote di quantità (subappalto_affidamenti).
 * Qui, senza rete: quanto resta di ogni voce, il venduto e il costo di ciò che è affidato, il margine
 * e cosa resta senza ditta. Il venduto si divide in proporzione alla quantità.
 * Il margine tiene conto di cosa comprende il prezzo della ditta: con «solo posa» i materiali della
 * voce li compra l'impresa, quindi si tolgono anche quelli (rischio R9 del piano).
 */

export interface VoceChiFaCosa {
  id: string;
  phase_id: string;
  descrizione: string;
  unita: string | null;
  quantita: number;
  /** Venduto della voce, senza IVA. */
  importo: number | null;
  /** Costo dei materiali per unità, senza IVA. */
  costo_materiali: number;
}

export interface AffidamentoChiFaCosa {
  id: string;
  voce_id: string;
  subappaltatore_id: string;
  quantita: number;
  prezzo_unitario: number | null;
  origine_prezzo: "listino_ditta" | "costo_aziendale" | "manuale";
  comprende: "posa" | "fornitura_e_posa";
  stato: "bozza" | "a_contratto";
}

/** La chiave della cache degli affidamenti di una commessa. */
export const chiaveAffidamenti = (orderId: string) => ["subappalto-affidamenti", orderId] as const;

const cent = (n: number) => Math.round(n * 100) / 100;
const num = (n: unknown) => (Number.isFinite(Number(n)) ? Number(n) : 0);

export interface StatoVoce {
  affidata: number;
  residua: number;
  /** Tutta la quantità ha una ditta. */
  piena: boolean;
  quote: AffidamentoChiFaCosa[];
  /** Venduto della parte affidata e della parte senza ditta. */
  vendutoAffidato: number;
  vendutoResiduo: number;
  /** Costo delle ditte sulla voce (quote × prezzo); le quote senza prezzo valgono 0 e si contano. */
  costoDitte: number;
  senzaPrezzo: number;
  /** Materiali a carico dell'impresa sulle quote «solo posa». */
  materialiNostri: number;
  /** Venduto affidato − costo ditte − materiali nostri. null se non c'è niente di affidato. */
  margine: number | null;
}

export function statoVoce(v: VoceChiFaCosa, affidamenti: ReadonlyArray<AffidamentoChiFaCosa>): StatoVoce {
  const quote = affidamenti.filter((a) => a.voce_id === v.id);
  const totale = Math.max(0, num(v.quantita));
  const affidata = quote.reduce((t, a) => t + num(a.quantita), 0);
  const residua = Math.max(0, Math.round((totale - affidata) * 1000) / 1000);
  const venduto = num(v.importo);
  const unitVenduto = totale > 0 ? venduto / totale : 0;
  const vendutoAffidato = cent(unitVenduto * Math.min(affidata, totale));
  const costoDitte = cent(quote.reduce((t, a) => t + num(a.quantita) * num(a.prezzo_unitario), 0));
  const materialiNostri = cent(quote.filter((a) => a.comprende === "posa").reduce((t, a) => t + num(a.quantita) * num(v.costo_materiali), 0));
  return {
    affidata, residua, piena: totale > 0 && residua <= 0.0005, quote,
    vendutoAffidato, vendutoResiduo: cent(venduto - vendutoAffidato),
    costoDitte, senzaPrezzo: quote.filter((a) => a.prezzo_unitario == null).length, materialiNostri,
    margine: quote.length ? cent(vendutoAffidato - costoDitte - materialiNostri) : null,
  };
}

export interface RiepilogoChiFaCosa {
  venduto: number;
  vendutoAffidato: number;
  vendutoSenzaDitta: number;
  costoDitte: number;
  materialiNostri: number;
  /** Margine sulla parte affidata. */
  margine: number;
  marginePct: number | null;
  voci: number;
  vociSenzaDitta: number;
  quoteSenzaPrezzo: number;
  ditte: number;
}

export function riepilogoChiFaCosa(voci: ReadonlyArray<VoceChiFaCosa>, affidamenti: ReadonlyArray<AffidamentoChiFaCosa>): RiepilogoChiFaCosa {
  let venduto = 0, vendutoAffidato = 0, vendutoSenzaDitta = 0, costoDitte = 0, materialiNostri = 0, vociSenzaDitta = 0, quoteSenzaPrezzo = 0;
  for (const v of voci) {
    const s = statoVoce(v, affidamenti);
    venduto += num(v.importo);
    vendutoAffidato += s.vendutoAffidato;
    vendutoSenzaDitta += s.vendutoResiduo;
    costoDitte += s.costoDitte;
    materialiNostri += s.materialiNostri;
    quoteSenzaPrezzo += s.senzaPrezzo;
    if (!s.piena) vociSenzaDitta += 1;
  }
  const margine = cent(vendutoAffidato - costoDitte - materialiNostri);
  return {
    venduto: cent(venduto), vendutoAffidato: cent(vendutoAffidato), vendutoSenzaDitta: cent(vendutoSenzaDitta),
    costoDitte: cent(costoDitte), materialiNostri: cent(materialiNostri), margine,
    marginePct: vendutoAffidato > 0 ? Math.round((margine / vendutoAffidato) * 1000) / 10 : null,
    voci: voci.length, vociSenzaDitta, quoteSenzaPrezzo,
    ditte: new Set(affidamenti.map((a) => a.subappaltatore_id)).size,
  };
}

/** Per ditta: quante voci, venduto e costo affidati, per il riepilogo in testa. */
export function perDitta(voci: ReadonlyArray<VoceChiFaCosa>, affidamenti: ReadonlyArray<AffidamentoChiFaCosa>) {
  const perId = new Map(voci.map((v) => [v.id, v]));
  const out = new Map<string, { voci: number; venduto: number; costo: number; aContratto: number }>();
  for (const a of affidamenti) {
    const v = perId.get(a.voce_id);
    if (!v) continue;
    const r = out.get(a.subappaltatore_id) ?? { voci: 0, venduto: 0, costo: 0, aContratto: 0 };
    const tot = Math.max(0, num(v.quantita));
    r.voci += 1;
    r.venduto = cent(r.venduto + (tot > 0 ? (num(v.importo) / tot) * num(a.quantita) : 0));
    r.costo = cent(r.costo + num(a.quantita) * num(a.prezzo_unitario));
    if (a.stato === "a_contratto") r.aContratto += 1;
    out.set(a.subappaltatore_id, r);
  }
  return out;
}
