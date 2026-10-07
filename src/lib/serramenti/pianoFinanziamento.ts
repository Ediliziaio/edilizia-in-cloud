/**
 * Il piano di finanziamento dello step Economia dei Serramenti (06/10/2026): come si compone quello che finisce
 * nel preventivo (`fin_piani`), senza interfaccia e senza database. Nessun conto nuovo: si usano le funzioni di
 * sempre — `findMigliorRiga` e `getDurateUniche` per la tabella della finanziaria, `calcolaPianoFinanziamento`
 * per il piano manuale — e si compongono i piani con gli stessi campi e gli stessi valori di prima
 * (nome, mesi, tasso, rata_mese, anticipo, finanziato). Una cosa è cambiata in `findMigliorRiga`: oltre l'ultima fascia
 * della tabella non dà più la rata dell'ultima fascia (sbagliata) ma `null`, e qui diventa «nessuna rata da tabella».
 *
 * Due modi, come prima:
 *  - da tabella: UN piano, preso dalla riga della tabella per importo e durata (TAN, TAEG e rata sono quelli della
 *    finanziaria, niente tassi a mano);
 *  - manuale: DUE piani, «Estesa» e «Standard», con durata e TAN scritti a mano.
 */
import {
  findMigliorRiga, getDurateUniche, type RigaFinanziamento,
} from "@/hooks/useTabelleFinanziamento";
import { calcolaPianoFinanziamento } from "@/lib/serramenti/ecobonus";
import type { SrPianoFinanziamento } from "@/types/serramenti";

/** Gli anticipi che si scelgono con un tocco, in percentuale del totale. */
export const ANTICIPI_VELOCI = [0, 10, 20, 30, 40] as const;

/** I valori di partenza del piano manuale, quelli di sempre: Estesa 120 mesi al 5,5%, Standard 60 mesi senza interessi. */
export const PIANO_MANUALE_DI_SERIE: PianiManuali = {
  estesa: { mesi: 120, tasso: 5.5 },
  standard: { mesi: 60, tasso: 0 },
};

export interface PianoManuale { mesi: number; tasso: number }
export interface PianiManuali { estesa: PianoManuale; standard: PianoManuale }

/** L'importo da finanziare: il totale (IVA inclusa) meno l'anticipo. La stessa espressione di sempre, non arrotondata. */
export function importoFinanziatoDa(totale: number, anticipoPct: number): number {
  return Math.max(0, totale - (totale * anticipoPct) / 100);
}

export interface DurataConRata {
  durataMesi: number;
  /** La riga della tabella che il preventivo userebbe per questa durata e questo importo. */
  riga: RigaFinanziamento;
}

/**
 * Per ogni durata della tabella, la riga giusta per l'importo da finanziare: serve a mostrare su ogni tasto la
 * rata già calcolata, così si confrontano le durate e si sceglie con un tocco. Una durata la cui ultima fascia sta
 * sotto l'importo non ha riga (e quindi niente tasto): una rata di una fascia più bassa sarebbe sbagliata.
 */
export function durateConRata(righe: RigaFinanziamento[], importoFinanziato: number): DurataConRata[] {
  return getDurateUniche(righe).flatMap((durataMesi) => {
    const riga = findMigliorRiga(righe, importoFinanziato, durataMesi);
    return riga ? [{ durataMesi, riga }] : [];
  });
}

export interface FasceTabella {
  /** L'ultima fascia della tabella (il massimo importo erogato); null se la tabella non ha righe. */
  fasciaMassima: number | null;
  /** Le durate che per questo importo non hanno una rata: l'importo supera la loro ultima fascia. */
  durateFuoriFascia: number[];
}

/** Dove sta l'importo da finanziare rispetto alle fasce della tabella: serve a dire «fuori fascia» invece di una rata sbagliata. */
export function fasceTabella(righe: RigaFinanziamento[], importoFinanziato: number): FasceTabella {
  if (righe.length === 0) return { fasciaMassima: null, durateFuoriFascia: [] };
  const conRata = new Set(durateConRata(righe, importoFinanziato).map((d) => d.durataMesi));
  return {
    fasciaMassima: Math.max(...righe.map((r) => Number(r.importo_erogato) || 0)),
    durateFuoriFascia: getDurateUniche(righe).filter((durata) => !conRata.has(durata)),
  };
}

export interface MotivoPianoIndietro {
  /** Il piano è calcolato su un totale diverso da quello di adesso. */
  totale: boolean;
  /** L'anticipo del piano non è quello scritto adesso (sul totale del piano stesso). */
  anticipo: boolean;
}

/**
 * Perché un piano scritto non corrisponde ai dati di adesso: il TOTALE è cambiato (anticipo + finanziato del piano sono
 * di un altro totale) e/o l'ANTICIPO è cambiato (la quota di anticipo del piano non è quella di adesso). Tutti e due
 * falsi: il piano è sbagliato per altro (la tabella della finanziaria è cambiata). Si confrontano gli importi al
 * centesimo: anticipo e finanziato si arrotondano ognuno per conto suo, e la somma può scostarsi di un centesimo.
 */
export function motivoPianoIndietro(piano: SrPianoFinanziamento, totale: number, anticipoPct: number): MotivoPianoIndietro {
  const anticipo = Number(piano.anticipo) || 0;
  const totaleDelPiano = anticipo + (Number(piano.finanziato) || 0);
  return {
    totale: Math.abs(totaleDelPiano - totale) >= 0.02,
    anticipo: Math.abs(anticipo - (totaleDelPiano * anticipoPct) / 100) >= 0.02,
  };
}

/** Il piano che nasce da una riga della tabella: TAN e rata sono della finanziaria, anticipo e finanziato del preventivo. */
export function pianoDaTabella(input: {
  nomeTabella: string | null | undefined;
  riga: RigaFinanziamento;
  totale: number;
  anticipoPct: number;
}): SrPianoFinanziamento {
  const { anticipo } = calcolaPianoFinanziamento({ importo_totale: input.totale, anticipo_pct: input.anticipoPct, piani: [] });
  return {
    nome: input.nomeTabella ?? "Finanziamento",
    mesi: input.riga.durata_mesi,
    tasso: input.riga.tan ?? 0,
    rata_mese: input.riga.importo_rata,
    anticipo,
    finanziato: importoFinanziatoDa(input.totale, input.anticipoPct),
  };
}

/** I due piani manuali (Estesa e Standard), con la rata calcolata da importo, durata e TAN. */
export function pianiManuali(input: { totale: number; anticipoPct: number; piani: PianiManuali }): SrPianoFinanziamento[] {
  const calcolo = calcolaPianoFinanziamento({
    importo_totale: input.totale,
    anticipo_pct: input.anticipoPct,
    piani: [
      { nome: "Estesa", durata_mesi: input.piani.estesa.mesi, tasso_annuo_pct: input.piani.estesa.tasso },
      { nome: "Standard", durata_mesi: input.piani.standard.mesi, tasso_annuo_pct: input.piani.standard.tasso },
    ],
  });
  return calcolo.piani.map((p) => ({
    nome: p.nome, mesi: p.mesi, tasso: p.tasso, rata_mese: p.rata_mese, anticipo: calcolo.anticipo, finanziato: calcolo.finanziato,
  }));
}

/** I piani manuali che stanno nel preventivo (Estesa e Standard, in quest'ordine), o quelli di serie. */
export function pianiManualiDaSalvati(piani: SrPianoFinanziamento[] | null | undefined): PianiManuali {
  if (!Array.isArray(piani) || piani.length < 2) return PIANO_MANUALE_DI_SERIE;
  const [estesa, standard] = piani;
  return {
    estesa: { mesi: Number(estesa.mesi) || 0, tasso: Number(estesa.tasso) || 0 },
    standard: { mesi: Number(standard.mesi) || 0, tasso: Number(standard.tasso) || 0 },
  };
}

/** Due piani sono lo stesso piano: stessi mesi e stessi soldi al centesimo, il nome non conta. */
export function pianiUguali(a: SrPianoFinanziamento[] | null | undefined, b: SrPianoFinanziamento[] | null | undefined): boolean {
  const x = Array.isArray(a) ? a : [];
  const y = Array.isArray(b) ? b : [];
  if (x.length !== y.length) return false;
  const vicini = (p: number, q: number) => Math.abs((Number(p) || 0) - (Number(q) || 0)) < 0.005;
  return x.every((p, i) => {
    const q = y[i];
    return Number(p.mesi) === Number(q.mesi)
      && vicini(p.tasso, q.tasso) && vicini(p.rata_mese, q.rata_mese)
      && vicini(p.anticipo, q.anticipo) && vicini(p.finanziato, q.finanziato);
  });
}
