/**
 * Il listino prodotti (le famiglie di `article_families`) dentro i preventivatori edili.
 *
 * Chi aggiunge una riga al computo dal «Listino prodotti» ritrova nel preventivo il
 * prodotto com'è nel listino: nome, prezzo, e — se ci sono — foto e descrizione, che
 * escono a destra nell'anteprima e nel PDF del cliente. Senza foto o senza
 * descrizione la riga resta com'è: niente segnaposto.
 *
 * Qui le regole che non dipendono da React: cosa si propone, a che prezzo, come si
 * legge la foto e la descrizione. Il prezzo lo calcola lo stesso motore dei
 * serramenti (`calcolaPrezzoFamiglia`), così sconti del fornitore e ricarico del
 * listino pesano uguale ovunque.
 */
import { calcolaPrezzoFamiglia } from "@/hooks/useFamilyPricing";
import type { FamilyWithAxes } from "@/types/articleFamily";
import { testoDelListino } from "./testoProdotto";

export { descrizioneBreve, testoDelListino } from "./testoProdotto";

/** L'area del listino a cui appartiene ciascun preventivatore edile (`article_families.vertical`). */
export type VerticaleModulo =
  | "bagno"
  | "tetti"
  | "climatizzazione"
  | "elettrico"
  | "termoidraulico"
  | "pavimenti"
  | "piscine"
  | "ristrutturazione";

/**
 * Aree del listino che un preventivatore edile NON propone: serramenti e fotovoltaico
 * hanno i loro preventivatori (griglie di misure, componenti), un prezzo «da» preso da
 * qui sarebbe sbagliato.
 */
export const VERTICALI_ESCLUSI: readonly string[] = ["serramenti", "serramentista", "fotovoltaico"];

/** Le colonne di `article_families` che servono al picker (una sola lista, per la query e per il test). */
export const COLONNE_FAMIGLIA_PICKER =
  "id, nome, codice, descrizione, immagine_url, vertical, unit_of_measure, modalita_prezzo_base, prezzo_base_mode, " +
  "prezzo_base_vendita, prezzo_base_acquisto, markup_tipo, markup_valore, sconto_fornitore_1, sconto_fornitore_2, " +
  "axes:article_family_axes(id)";

/** Una famiglia come arriva dalla query del picker. I numeri possono arrivare anche come testo. */
export interface RigaFamigliaPicker {
  id: string;
  nome: string | null;
  codice?: string | null;
  descrizione?: string | null;
  immagine_url?: string | null;
  vertical?: string | null;
  unit_of_measure?: string | null;
  modalita_prezzo_base?: string | null;
  prezzo_base_mode?: string | null;
  prezzo_base_vendita?: number | string | null;
  prezzo_base_acquisto?: number | string | null;
  markup_tipo?: string | null;
  markup_valore?: number | string | null;
  sconto_fornitore_1?: number | string | null;
  sconto_fornitore_2?: number | string | null;
  /** Gli assi (varianti) del prodotto: basta sapere se ci sono. */
  axes?: Array<{ id: string }> | null;
}

/** Un prodotto del listino pronto per essere scelto: tutto quello che il picker e la riga del computo usano. */
export interface ProdottoListino {
  id: string;
  nome: string;
  codice: string | null;
  /** Descrizione del listino, ripulita; null se non c'è. */
  descrizione: string | null;
  /** Foto del listino (percorso dell'app o link pubblico); null se non c'è. */
  immagine_url: string | null;
  vertical: string | null;
  /** Al metro quadro o a pezzo: decide l'unità di misura della riga. */
  modo: "pz" | "mq";
  /** Unità scritta nel listino per i prodotti a pezzo («pz», «ml», «kg»…). */
  unita: string | null;
  /** Prezzo di vendita unitario (a pezzo, o al metro quadro). IVA esclusa. */
  prezzo_vendita: number;
  /** Costo d'acquisto unitario, già al netto degli sconti del fornitore. */
  prezzo_acquisto: number;
  /** Il listino gli dà varianti (colore, misura…): il prezzo qui è quello di base. */
  con_varianti: boolean;
}

const numero = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const arrotonda2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Solo i prodotti che il preventivatore sa prezzare: a pezzo o al metro quadro.
 * Le griglie di misure e la misura libera sono dei serramenti.
 */
export function eProdottoPrezzabile(riga: Pick<RigaFamigliaPicker, "modalita_prezzo_base">): boolean {
  return riga.modalita_prezzo_base === "pz" || riga.modalita_prezzo_base === "mq";
}

/** Dalla riga del database al prodotto da proporre. */
export function famigliaInProdotto(riga: RigaFamigliaPicker): ProdottoListino {
  const modo: "pz" | "mq" = riga.modalita_prezzo_base === "mq" ? "mq" : "pz";
  // Il motore dei prezzi vuole una famiglia con i suoi assi: qui i prodotti si prendono
  // «di base» (nessuna variante scelta), a 1 pezzo o a 1 metro quadro.
  const famiglia = {
    modalita_prezzo_base: modo,
    prezzo_base_mode: riga.prezzo_base_mode === "acquisto_markup" ? "acquisto_markup" : "vendita",
    prezzo_base_vendita: numero(riga.prezzo_base_vendita),
    prezzo_base_acquisto: numero(riga.prezzo_base_acquisto),
    markup_tipo: riga.markup_tipo ?? "percentuale",
    markup_valore: numero(riga.markup_valore),
    sconto_fornitore_1: numero(riga.sconto_fornitore_1),
    sconto_fornitore_2: numero(riga.sconto_fornitore_2),
    axes: [],
  } as unknown as FamilyWithAxes;
  const prezzo = calcolaPrezzoFamiglia({
    family: famiglia,
    selections: {},
    ...(modo === "mq" ? { larghezza_mm: 1000, altezza_mm: 1000 } : {}),
    quantita: 1,
  });
  return {
    id: riga.id,
    nome: testoDelListino(riga.nome) ?? "Prodotto",
    codice: testoDelListino(riga.codice),
    descrizione: testoDelListino(riga.descrizione),
    immagine_url: testoDelListino(riga.immagine_url),
    vertical: testoDelListino(riga.vertical),
    modo,
    unita: modo === "mq" ? "mq" : testoDelListino(riga.unit_of_measure),
    prezzo_vendita: arrotonda2(Math.max(0, numero(prezzo.unit_price_vendita))),
    prezzo_acquisto: arrotonda2(Math.max(0, numero(prezzo.unit_price_acquisto))),
    con_varianti: (riga.axes?.length ?? 0) > 0,
  };
}

const AREE: Record<string, string> = {
  bagno: "Bagno",
  tetti: "Tetti",
  climatizzazione: "Climatizzazione",
  elettrico: "Elettrico",
  termoidraulico: "Termoidraulico",
  pavimenti: "Pavimenti",
  piscine: "Piscine",
  ristrutturazione: "Ristrutturazione",
  cappotto: "Cappotto",
  facciate: "Facciate",
  giardini: "Giardini",
  pergole: "Pergole",
  "pareti-soffitti": "Pareti e soffitti",
  generico: "Generico",
};

/** L'area del listino in parole («bagno» → «Bagno»); vuota se non c'è. */
export function areaDelProdotto(vertical: string | null | undefined): string {
  const v = (vertical ?? "").trim().toLowerCase();
  if (!v) return "";
  return AREE[v] ?? v.charAt(0).toUpperCase() + v.slice(1);
}

/** Le righe sotto il nome, nel picker: area (se è di un'altra area), codice, e un cenno se ha varianti. */
export function dettaglioNelPicker(p: ProdottoListino, verticaleDelModulo: string): string {
  return [
    p.vertical && p.vertical !== verticaleDelModulo ? areaDelProdotto(p.vertical) : null,
    p.codice,
    p.con_varianti ? "con varianti: prezzo di base" : null,
  ].filter(Boolean).join(" · ");
}
