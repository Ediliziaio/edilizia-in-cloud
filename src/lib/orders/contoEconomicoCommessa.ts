/**
 * Conto economico della commessa per macro-voci, come in controllo di gestione:
 * PREVENTIVO (quanto doveva costare) e CONSUNTIVO (quanto è costato finora), con
 * l'incidenza di ogni voce sui ricavi, il previsto ad oggi secondo l'avanzamento
 * dei lavori, lo scostamento, la quota di struttura e il margine netto.
 *
 * Nessun numero nuovo:
 * - consuntivo = v_ordine_marginalita (useOrderEconomicsBase.actual): la somma
 *   delle voci è sempre il «consuntivo» della vista. Le voci che la vista tiene
 *   insieme si dividono qui: manodopera = persone (order_employees) + ditte
 *   (il resto); costi diretti per tipo di fornitore, e quello che non si riesce
 *   ad attribuire va in «oneri e costi di cantiere», così il totale torna.
 * - preventivo = il costo previsto delle lavorazioni (economiaFasi, lo stesso
 *   della scheda Lavorazioni): materiali, manodopera, ditte. Le altre voci non
 *   hanno un preventivo: restano vuote, non zero.
 * - struttura = quota mensile dei costi generali per cantiere attivo
 *   (useCompanyStructure) × mesi: previsti dalla durata dei lavori, maturati
 *   dall'inizio a oggi.
 */

export type VoceConto =
  | "materiali" | "manodopera" | "subappalti" | "professionisti" | "noleggi" | "cantiere"
  | "provvigioni" | "rimborsi" | "errori";

export interface ConsuntivoCommessa {
  /** Acquisti impegnati (ODA) e materiali da scorta. */
  acquisti: number;
  magazzino: number;
  /** Manodopera totale della vista (persone + ditte, senza IVA). */
  manodopera: number;
  /** Solo le persone interne (order_employees.total_cost). */
  persone: number;
  provvigioni: number;
  rimborsi: number;
  errori: number;
  /** Costi diretti della vista (company_costs senza ODA né ditta, quote ripartite incluse). */
  diretti: number;
  /** Gli stessi costi diretti per tipo del fornitore (suppliers.tipo, «nessuno» se manca). */
  direttiPerTipo: Record<string, number>;
}

export interface PrevistoCommessa {
  materiali: number;
  manodopera: number;
  ditte: number;
}

export interface StrutturaCommessa {
  /** Quota mensile della struttura per cantiere attivo; null se non calcolabile. */
  mensile: number | null;
  mesiPrevisti: number | null;
  mesiMaturati: number | null;
}

export interface RigaConto {
  key: VoceConto;
  label: string;
  gruppo: "diretti" | "commerciali";
  preventivo: number | null;
  consuntivo: number;
  /** % sui ricavi totali (preventivo) e sul ricavo maturato (consuntivo). */
  incidenzaPreventivo: number | null;
  incidenzaConsuntivo: number | null;
  /** Preventivo × avanzamento: quanto avrebbe dovuto costare a questo punto. */
  previstoAOggi: number | null;
  /** Consuntivo − previsto ad oggi: sopra zero si spende più del previsto. */
  scostamento: number | null;
}

export interface ContoEconomico {
  ricavi: number;
  /** Ricavi × avanzamento: il valore dei lavori fatti finora. */
  ricavoMaturato: number;
  avanzamento: number | null;
  righe: RigaConto[];
  costiPreventivo: number;
  costiConsuntivo: number;
  marginePreventivo: number;
  margineConsuntivo: number;
  /** Sul ricavo maturato: margine di quello che è stato fatto. */
  margineMaturato: number;
  struttura: { preventivo: number | null; consuntivo: number | null };
  margineNettoPreventivo: number | null;
  margineNettoMaturato: number | null;
  /** Ci sono voci con preventivo: il confronto ha senso. */
  haPreventivo: boolean;
}

const LABEL: Record<VoceConto, string> = {
  materiali: "Materiali e articoli",
  manodopera: "Manodopera interna (operai)",
  subappalti: "Subappalti e ditte",
  professionisti: "Professionisti e tecnici",
  noleggi: "Noleggi e mezzi",
  cantiere: "Oneri e costi di cantiere",
  provvigioni: "Provvigioni",
  rimborsi: "Rimborsi km",
  errori: "Errori e rilavorazioni",
};

const f = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const c = (v: number) => Math.round(v * 100) / 100;
const perc = (v: number, su: number) => (su > 0 ? Math.round((v / su) * 1000) / 10 : null);

/** Tipo del fornitore → macro-voce. Generali, enti, agenti e nessun fornitore: costi di cantiere. */
export function voceDaTipoFornitore(tipo: string | null | undefined): VoceConto {
  switch (tipo) {
    case "materiali": return "materiali";
    case "subappalto": return "subappalti";
    case "professionisti": return "professionisti";
    case "noli_servizi":
    case "mezzi": return "noleggi";
    default: return "cantiere";
  }
}

export function contoEconomicoCommessa(input: {
  ricavi: number;
  avanzamentoPct: number | null;
  consuntivo: ConsuntivoCommessa;
  previsto: PrevistoCommessa | null;
  struttura: StrutturaCommessa;
}): ContoEconomico {
  const ricavi = f(input.ricavi);
  const av = input.avanzamentoPct == null ? null : Math.min(100, Math.max(0, f(input.avanzamentoPct)));
  const k = input.consuntivo;

  // Costi diretti per macro-voce; quello che resta va ai costi di cantiere, così il totale è quello della vista.
  const diretti: Record<VoceConto, number> = { materiali: 0, manodopera: 0, subappalti: 0, professionisti: 0, noleggi: 0, cantiere: 0, provvigioni: 0, rimborsi: 0, errori: 0 };
  let attribuiti = 0;
  for (const [tipo, importo] of Object.entries(k.direttiPerTipo)) {
    const v = f(importo);
    diretti[voceDaTipoFornitore(tipo === "nessuno" ? null : tipo)] += v;
    attribuiti += v;
  }
  diretti.cantiere += f(k.diretti) - attribuiti;

  const persone = Math.min(f(k.persone), f(k.manodopera));
  const consuntivo: Record<VoceConto, number> = {
    materiali: f(k.acquisti) + f(k.magazzino) + diretti.materiali,
    manodopera: persone,
    subappalti: f(k.manodopera) - persone + diretti.subappalti,
    professionisti: diretti.professionisti,
    noleggi: diretti.noleggi,
    cantiere: diretti.cantiere,
    provvigioni: f(k.provvigioni),
    rimborsi: f(k.rimborsi),
    errori: f(k.errori),
  };
  const p = input.previsto;
  const preventivo: Partial<Record<VoceConto, number>> = p
    ? { materiali: f(p.materiali), manodopera: f(p.manodopera), subappalti: f(p.ditte) }
    : {};
  const haPreventivo = Object.values(preventivo).some((v) => (v ?? 0) > 0);

  const ricavoMaturato = av == null ? ricavi : ricavi * av / 100;
  const ordine: VoceConto[] = ["materiali", "manodopera", "subappalti", "professionisti", "noleggi", "cantiere", "provvigioni", "rimborsi", "errori"];
  const righe: RigaConto[] = ordine
    .map((key) => {
      const prev = haPreventivo && preventivo[key] != null && preventivo[key]! > 0 ? c(preventivo[key]!) : null;
      const cons = c(consuntivo[key]);
      const aOggi = prev != null && av != null ? c(prev * av / 100) : null;
      return {
        key, label: LABEL[key],
        gruppo: key === "provvigioni" || key === "rimborsi" || key === "errori" ? "commerciali" as const : "diretti" as const,
        preventivo: prev, consuntivo: cons,
        incidenzaPreventivo: prev == null ? null : perc(prev, ricavi),
        incidenzaConsuntivo: perc(cons, ricavoMaturato),
        previstoAOggi: aOggi,
        scostamento: aOggi == null ? null : c(cons - aOggi),
      };
    })
    // Le voci senza costi né preventivo non dicono niente: via.
    .filter((r) => r.consuntivo !== 0 || r.preventivo != null || r.key === "materiali" || r.key === "manodopera");

  const costiPreventivo = c(righe.reduce((s, r) => s + (r.preventivo ?? 0), 0));
  const costiConsuntivo = c(righe.reduce((s, r) => s + r.consuntivo, 0));
  const s = input.struttura;
  const strutturaPrev = s.mensile != null && s.mesiPrevisti != null ? c(s.mensile * Math.max(0, s.mesiPrevisti)) : null;
  const strutturaCons = s.mensile != null && s.mesiMaturati != null ? c(s.mensile * Math.max(0, s.mesiMaturati)) : null;
  const marginePreventivo = c(ricavi - costiPreventivo);
  const margineMaturato = c(ricavoMaturato - costiConsuntivo);

  return {
    ricavi: c(ricavi),
    ricavoMaturato: c(ricavoMaturato),
    avanzamento: av,
    righe,
    costiPreventivo,
    costiConsuntivo,
    marginePreventivo,
    margineConsuntivo: c(ricavi - costiConsuntivo),
    margineMaturato,
    struttura: { preventivo: strutturaPrev, consuntivo: strutturaCons },
    margineNettoPreventivo: haPreventivo && strutturaPrev != null ? c(marginePreventivo - strutturaPrev) : null,
    margineNettoMaturato: strutturaCons != null ? c(margineMaturato - strutturaCons) : null,
    haPreventivo,
  };
}

export const pctIt = (v: number | null | undefined) =>
  v == null ? "—" : `${v.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
