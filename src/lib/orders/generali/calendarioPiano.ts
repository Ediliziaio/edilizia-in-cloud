// src/lib/orders/generali/calendarioPiano.ts
// Il calendario rapido del piano economico. Un business plan importato da Excel non ha i mesi
// (il file dice «durata lavori 15 mesi», non quando si paga ogni voce) e senza mese una voce
// non entra né nel flusso di cassa né nel capitale impegnato, e il budget non si approva.
// Metterli uno a uno sono centinaia di clic.
//
// Qui si ragiona come chi fa l'operazione: per gruppi (le categorie del piano) e in mesi
// contati dall'inizio — «la costruzione parte al mese 5 e dura 16 mesi» —, la stessa lingua
// delle voci di partenza di ogni modello (VOCI_DI_PARTENZA: dopoMesi, durataMesi), che fanno
// da proposta. Il mese d'inizio non si propone: lo sceglie chi conosce l'operazione.
import type { ModelloGenerale } from "@/lib/orders/commesseGenerali";
import type { VocePiano } from "./pianoConti";
import { CATEGORIE_COSTO, CATEGORIE_PIANO, CATEGORIE_RICAVO, VOCI_DI_PARTENZA, aggiungiMesi, type CategoriaPiano, type TipoVoce } from "./pianoCategorie";

export interface TempiGruppo {
  /** Mesi dall'inizio: 0 = il mese d'inizio. */
  dopoMesi: number;
  /** Su quanti mesi si distribuisce l'importo di ogni voce. */
  durataMesi: number;
}

export interface GruppoCalendario extends TempiGruppo {
  categoria: CategoriaPiano;
  tipo: TipoVoce;
  nome: string;
  /** Le voci del gruppo. */
  voci: number;
  /** Quelle con un importo e senza mese: sono loro a bloccare cassa e approvazione. */
  senzaMese: number;
  /** Quelle che hanno già un mese. */
  conMese: number;
  importo: number;
}

export const DURATA_MASSIMA = 120;

/**
 * I tempi proposti per una categoria. Le categorie che il modello elenca usano i suoi tempi;
 * le altre seguono la sorella più vicina: i costi di cantiere la costruzione, le spese
 * generali e i costi senza una casa la durata degli oneri finanziari (tutta l'operazione).
 */
export function tempiProposti(modello: ModelloGenerale, categoria: CategoriaPiano): TempiGruppo {
  const partenza = VOCI_DI_PARTENZA[modello];
  const di = (c: CategoriaPiano) => partenza.find((v) => v.categoria === c);
  const cantiere: CategoriaPiano[] = ["materiali", "manodopera", "subappalti", "noli", "sicurezza", "imprevisti"];
  const voce = di(categoria)
    ?? (cantiere.includes(categoria) ? di("costruzione") : undefined)
    ?? (categoria === "lavori" || categoria === "altri_ricavi" ? partenza.find((v) => v.tipo === "ricavo") : undefined)
    ?? di("finanziari")
    ?? partenza.find((v) => v.tipo === "costo");
  return { dopoMesi: voce?.dopoMesi ?? 0, durataMesi: voce?.durataMesi ?? 1 };
}

const ORDINE: CategoriaPiano[] = [...CATEGORIE_RICAVO, ...CATEGORIE_COSTO];

/** Le voci del piano raggruppate per categoria, nell'ordine del piano: prima i ricavi, poi i costi. */
export function gruppiCalendario(voci: VocePiano[], modello: ModelloGenerale): GruppoCalendario[] {
  const gruppi = new Map<CategoriaPiano, GruppoCalendario>();
  for (const v of voci) {
    let g = gruppi.get(v.categoria);
    if (!g) {
      g = {
        categoria: v.categoria, tipo: v.tipo, nome: CATEGORIE_PIANO[v.categoria]?.nome ?? v.categoria,
        voci: 0, senzaMese: 0, conMese: 0, importo: 0, ...tempiProposti(modello, v.categoria),
      };
      gruppi.set(v.categoria, g);
    }
    g.voci += 1;
    g.importo += Math.max(0, v.importo);
    if (v.mese) g.conMese += 1;
    else if (v.importo > 0) g.senzaMese += 1;
  }
  return [...gruppi.values()].sort((a, b) => ORDINE.indexOf(a.categoria) - ORDINE.indexOf(b.categoria));
}

/** Quanti mesi dura l'operazione con questi tempi: dall'inizio alla fine del gruppo che finisce per ultimo. */
export const durataOperazione = (tempi: TempiGruppo[]): number =>
  tempi.reduce((max, t) => Math.max(max, t.dopoMesi + t.durataMesi), 0);

export const tempiValidi = (t: TempiGruppo): boolean =>
  Number.isInteger(t.dopoMesi) && Number.isInteger(t.durataMesi)
  && t.dopoMesi >= 0 && t.dopoMesi < DURATA_MASSIMA && t.durataMesi >= 1 && t.durataMesi <= DURATA_MASSIMA;

export interface ModificaCalendario {
  id: string;
  mese: string;
  durataMesi: number;
}

/**
 * Le voci da cambiare: ogni voce del gruppo prende il mese d'inizio del gruppo e la sua durata.
 * Le voci che hanno già un mese restano come sono, a meno di chiederlo. I gruppi con tempi non
 * validi non si toccano.
 */
export function applicaCalendario(
  voci: VocePiano[],
  inizio: string,
  tempi: Partial<Record<CategoriaPiano, TempiGruppo>>,
  opzioni: { ancheConMese?: boolean } = {},
): ModificaCalendario[] {
  if (!/^\d{4}-\d{2}$/.test(inizio)) return [];
  const modifiche: ModificaCalendario[] = [];
  for (const v of voci) {
    const t = tempi[v.categoria];
    if (!t || !tempiValidi(t)) continue;
    if (v.mese && !opzioni.ancheConMese) continue;
    const mese = aggiungiMesi(inizio, t.dopoMesi);
    if (v.mese === mese && v.durataMesi === t.durataMesi) continue;
    modifiche.push({ id: v.id, mese, durataMesi: t.durataMesi });
  }
  return modifiche;
}
