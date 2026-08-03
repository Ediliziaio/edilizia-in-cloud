/**
 * Costo orario reale di un operaio edile.
 *
 * Il calcolo che quasi tutte le imprese sbagliano, e sempre nello stesso
 * modo: si preventiva sulla paga oraria lorda della busta paga, che è solo
 * una frazione di quanto l'ora costa davvero all'azienda.
 *
 * Il costo orario reale ha due componenti che vanno tenute distinte:
 *
 *   1. Il COSTO ANNUO PIENO — retribuzione lorda + contributi + Cassa Edile
 *      + TFR + ratei di 13ª/14ª dove previste. È il numeratore.
 *
 *   2. Le ORE EFFETTIVAMENTE PRODUTTIVE — non le ore contrattuali. Ferie,
 *      permessi, festività, malattia, formazione e maltempo sono ore pagate
 *      in cui non si produce, e vanno TOLTE dal denominatore. È qui che sta
 *      la sorpresa: dividere per le ore contrattuali invece che per quelle
 *      produttive sottostima il costo del 15-20% circa.
 *
 * Il calcolatore non impone percentuali contributive: le chiede in input,
 * perché variano per inquadramento, territorio e CCNL applicato. Chi non
 * le conosce le trova nel prospetto paghe o le chiede al consulente del
 * lavoro — dare un numero "medio" qui significherebbe far preventivare
 * l'utente su un dato falso, che è esattamente il problema da risolvere.
 */

export interface CostoOrarioInput {
  /** Retribuzione lorda annua dell'operaio (senza contributi a carico azienda). */
  retribuzioneLordaAnnua: number;
  /** Contributi INPS/INAIL a carico azienda, in % sulla lorda. */
  percentualeContributi: number;
  /** Contributi Cassa Edile a carico azienda, in % sulla lorda. */
  percentualeCassaEdile: number;
  /** Accantonamento TFR, in % sulla lorda. */
  percentualeTFR: number;
  /** Altri costi annui diretti: DPI, visite mediche, formazione, trasferte fisse. */
  altriCostiAnnui: number;
  /** Ore contrattuali annue teoriche (tipicamente ~2.080 su 40 h × 52 settimane). */
  oreContrattualiAnnue: number;
  /** Ore annue pagate ma non produttive: ferie, permessi, festività, malattia, formazione, maltempo. */
  oreNonProduttiveAnnue: number;
}

export interface CostoOrarioResult {
  /** Costo annuo pieno per l'azienda. */
  costoAnnuoTotale: number;
  /** Somma dei soli oneri (contributi + Cassa Edile + TFR + altri). */
  oneriTotali: number;
  /** Ore realmente disponibili per produrre. */
  oreProduttive: number;
  /** Il numero che serve: costo annuo pieno / ore produttive. */
  costoOrarioReale: number;
  /** Il numero sbagliato che si usa di solito: lorda / ore contrattuali. */
  costoOrarioApparente: number;
  /** Di quanto il costo reale supera quello apparente, in %. */
  scostamentoPercentuale: number;
  /** true se gli input non permettono un calcolo sensato. */
  invalido: boolean;
}

function safe(n: number): number {
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function round(value: number, decimali = 2): number {
  if (!Number.isFinite(value)) return 0;
  const f = 10 ** decimali;
  return Math.round((value + Number.EPSILON) * f) / f;
}

export function calcolaCostoOrario(input: CostoOrarioInput): CostoOrarioResult {
  const lorda = safe(input.retribuzioneLordaAnnua);
  const oreContrattuali = safe(input.oreContrattualiAnnue);
  const oreNonProduttive = safe(input.oreNonProduttiveAnnue);

  const contributi = (lorda * safe(input.percentualeContributi)) / 100;
  const cassaEdile = (lorda * safe(input.percentualeCassaEdile)) / 100;
  const tfr = (lorda * safe(input.percentualeTFR)) / 100;
  const altri = safe(input.altriCostiAnnui);

  const oneriTotali = round(contributi + cassaEdile + tfr + altri);
  const costoAnnuoTotale = round(lorda + oneriTotali);

  // Se le ore non produttive superano (o eguagliano) le contrattuali il
  // calcolo non ha senso: si segnala invece di restituire Infinity.
  const oreProduttive = round(oreContrattuali - oreNonProduttive, 1);
  const invalido = lorda <= 0 || oreContrattuali <= 0 || oreProduttive <= 0;

  if (invalido) {
    return {
      costoAnnuoTotale,
      oneriTotali,
      oreProduttive: Math.max(0, oreProduttive),
      costoOrarioReale: 0,
      costoOrarioApparente: 0,
      scostamentoPercentuale: 0,
      invalido: true,
    };
  }

  const costoOrarioReale = round(costoAnnuoTotale / oreProduttive);
  const costoOrarioApparente = round(lorda / oreContrattuali);
  const scostamentoPercentuale =
    costoOrarioApparente > 0
      ? round(((costoOrarioReale - costoOrarioApparente) / costoOrarioApparente) * 100, 1)
      : 0;

  return {
    costoAnnuoTotale,
    oneriTotali,
    oreProduttive,
    costoOrarioReale,
    costoOrarioApparente,
    scostamentoPercentuale,
    invalido: false,
  };
}
