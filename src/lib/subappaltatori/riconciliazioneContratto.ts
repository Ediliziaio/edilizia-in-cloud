/**
 * La riconciliazione di un contratto di subappalto: quanto vale, quanto è stato
 * eseguito (SAL), fatturato, pagato e trattenuto, e cosa non torna.
 *
 * I SAL contestati non contano (né nell'eseguito né nel da pagare); il fatturato
 * è l'imponibile delle fatture ricevute collegate al contratto (nei subappalti
 * edili c'è il reverse charge: l'IVA non è un costo del subappaltatore).
 */

export interface ContrattoPerRiepilogo {
  importo_contrattuale: number;
  oneri_sicurezza?: number | null;
}
export interface SalPerRiepilogo {
  importo_lordo: number;
  ritenuta_importo: number;
  importo_netto: number;
  stato: "ricevuto" | "verificato" | "pagato" | "contestato" | string;
}
export interface FatturaPerRiepilogo {
  imponibile_totale: number | null;
  totale_documento?: number | null;
  tipo_documento?: string | null;
}
export interface RitenutaPerRiepilogo {
  importo: number;
  stato: string;
}

export interface RiepilogoContratto {
  valore: number;
  eseguito: number;
  approvato: number;
  fatturato: number;
  pagato: number;
  daPagare: number;
  ritenuteTrattenute: number;
  ritenuteSvincolate: number;
  residuo: number;
  avanzamento: number;
  avvisi: string[];
}

const n = (v: unknown) => Number(v) || 0;
const euro = (v: number) => v.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
const tondo = (v: number) => Math.round(v * 100) / 100;

/** Le note di credito (TD04) riducono il fatturato. */
function imponibile(f: FatturaPerRiepilogo): number {
  const base = f.imponibile_totale != null ? n(f.imponibile_totale) : n(f.totale_documento);
  return f.tipo_documento === "TD04" ? -Math.abs(base) : base;
}

export function riepilogoContratto(
  c: ContrattoPerRiepilogo, sal: SalPerRiepilogo[], fatture: FatturaPerRiepilogo[], ritenute: RitenutaPerRiepilogo[],
): RiepilogoContratto {
  const validi = sal.filter((s) => s.stato !== "contestato");
  const valore = tondo(n(c.importo_contrattuale) + n(c.oneri_sicurezza));
  const eseguito = tondo(validi.reduce((t, s) => t + n(s.importo_lordo), 0));
  const approvato = tondo(validi.filter((s) => s.stato === "verificato" || s.stato === "pagato").reduce((t, s) => t + n(s.importo_lordo), 0));
  const fatturato = tondo(fatture.reduce((t, f) => t + imponibile(f), 0));
  const pagato = tondo(validi.filter((s) => s.stato === "pagato").reduce((t, s) => t + n(s.importo_netto), 0));
  const daPagare = tondo(validi.filter((s) => s.stato !== "pagato").reduce((t, s) => t + n(s.importo_netto), 0));
  const ritenuteTrattenute = tondo(ritenute.filter((r) => r.stato === "trattenuta").reduce((t, r) => t + n(r.importo), 0));
  const ritenuteSvincolate = tondo(ritenute.filter((r) => r.stato === "svincolata").reduce((t, r) => t + n(r.importo), 0));

  const avvisi: string[] = [];
  if (valore > 0 && eseguito > valore + 0.01) avvisi.push(`I SAL (${euro(eseguito)}) superano il valore del contratto (${euro(valore)}): serve una variante o un SAL va corretto.`);
  if (fatturato > approvato + 0.01) avvisi.push(`Fatturato ${euro(fatturato)} più dei SAL approvati (${euro(approvato)}): approva i SAL o verifica la fattura.`);
  if (pagato > 0 && fatture.length > 0 && pagato > fatturato + 0.01) avvisi.push(`Pagato ${euro(pagato)} più del fatturato (${euro(fatturato)}): manca una fattura.`);
  if (pagato > 0 && fatture.length === 0) avvisi.push("Ci sono SAL pagati ma nessuna fattura collegata: collega le fatture del subappaltatore.");
  // Le ritenute calcolate sui SAL devono stare nel registro (da lì si svincolano).
  const ritenuteDaSal = tondo(validi.reduce((t, s) => t + n(s.ritenuta_importo), 0));
  const ritenuteRegistrate = tondo(ritenute.filter((r) => r.stato !== "annullata").reduce((t, r) => t + n(r.importo), 0));
  if (ritenuteDaSal > ritenuteRegistrate + 0.01) avvisi.push(`Sui SAL risultano ritenute per ${euro(ritenuteDaSal)}, ma nel registro ne sono segnate ${euro(ritenuteRegistrate)}: alcune ritenute non sono state registrate.`);

  return {
    valore, eseguito, approvato, fatturato, pagato, daPagare, ritenuteTrattenute, ritenuteSvincolate,
    residuo: tondo(Math.max(0, valore - eseguito)),
    avanzamento: valore > 0 ? Math.min(100, Math.round((eseguito / valore) * 100)) : 0,
    avvisi,
  };
}
