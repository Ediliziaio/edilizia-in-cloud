/**
 * Cosa fa davvero l'importazione dei listini, scritto una volta sola per il foglio Excel/CSV e per il PDF con l'AI.
 *
 * I tre «tipi» scrivono in tre posti diversi (`supabase/functions/catalog-import-batch/index.ts`):
 *  - `product`  → `article_templates`, il catalogo articoli: lo usano gli ordini, il computo dei preventivi edili e le
 *                 voci dei kit. NON è il Listino (i prodotti del Listino stanno in `article_families`) e non c'è una
 *                 pagina in cui rivederli o cancellarli;
 *  - `family`   → `article_families`, cioè i prodotti del Listino, sempre «a pezzo» (`modalita_prezzo_base: "pz"`),
 *                 senza tipologia né linea, a 0 € se il file non dice il prezzo (e il modello non ha le colonne);
 *  - `tariffa`  → `tariffe_aziendali`, «Manodopera e servizi», voci a ore.
 *
 * Il tipo che parte preselezionato resta `product` (decisione D1 di Florin ancora aperta): qui si dice solo la verità su
 * ognuno. `destinazioniImport.test.ts` confronta questi testi con la edge function e col modello: se uno dei due cambia,
 * il test lo dice.
 */
import type { CatalogObjectType } from "@/hooks/useCompanyCustomFields";
import { FIXED_COLUMNS } from "@/lib/catalogo/listinoTemplate";

export interface DestinazioneImport {
  /** Come si chiama nel menu a tendina. */
  nome: string;
  /** Dove vanno i dati, in una frase: si vede sempre sotto il menu. */
  dove: string;
  /** Cosa il file non può dire e l'importazione decide da sola: si vede sempre, se c'è. */
  attenzione: string[];
  /** Cosa succede se la riga c'è già. */
  seEsiste: string;
  /** Come si annulla un'importazione già fatta: si legge nel passo di conferma. */
  annullare: string;
  singolare: string;
  plurale: string;
}

export const DESTINAZIONI_IMPORT: Record<CatalogObjectType, DestinazioneImport> = {
  product: {
    nome: "Catalogo articoli (ordini e preventivi edili)",
    dove:
      "Va nel catalogo articoli, l'elenco che usano gli ordini, il computo dei preventivi edili e le voci dei kit. Non compare nel Listino.",
    attenzione: [],
    seEsiste: "Un articolo con lo stesso codice o nome si aggiorna: cambiano solo i campi che il file compila.",
    annullare: "Non c'è una pagina in cui rivedere o cancellare questi articoli: da qui l'importazione non si annulla.",
    singolare: "articolo",
    plurale: "articoli",
  },
  family: {
    nome: "Prodotti del Listino",
    dove: "Va nel Listino, tra i prodotti: li trovi nell'area «Generale», alla voce «Senza tipologia».",
    attenzione: [
      "Il file non dice come si vende né in che tipologia sta: ogni prodotto nuovo entra «a pezzo», senza tipologia e senza linea. Finché non gli dai una tipologia dal Listino non compare nella scelta dei prodotti del preventivo (lo trovi con la ricerca). I prodotti al metro quadro o a griglia di misure si fanno dal Listino.",
      "Il modello non ha le colonne di prezzo, costo, IVA e unità: i prodotti nascono a 0 €, con IVA 22%. Il prezzo si mette dal Listino.",
    ],
    seEsiste:
      "Se c'è già un prodotto con lo stesso nome tra quelli senza linea, si aggiorna: cambiano solo i campi che il file compila. Negli altri casi ne nasce uno nuovo.",
    annullare: "Per annullare dovrai eliminarli a mano dal Listino: restano 15 giorni nel cestino.",
    singolare: "prodotto",
    plurale: "prodotti",
  },
  tariffa: {
    nome: "Manodopera e servizi",
    dove: "Va in Listino → Manodopera e servizi, come voci a ore.",
    attenzione: [],
    seEsiste: "Una voce con lo stesso nome si aggiorna: cambiano solo i campi che il file compila.",
    annullare: "Per annullare dovrai eliminarle a mano da Manodopera e servizi.",
    singolare: "voce",
    plurale: "voci",
  },
};

/**
 * Colonne del modello che l'importazione NON legge: restano nel file ma non finiscono da nessuna parte.
 * (Chiavi di `FIXED_COLUMNS`. Il test sulla edge function le tiene allineate.)
 */
export const COLONNE_NON_LETTE: Record<CatalogObjectType, string[]> = {
  product: [],
  family: ["code", "parent", "default_margin_pct", "default_markup_pct"],
  tariffa: ["codice", "margine_pct", "ore_giornaliere", "valida_dal", "valida_al"],
};

/** I nomi che il titolare vede nel modello, per le colonne non lette di un tipo. */
export function nomiColonneNonLette(tipo: CatalogObjectType): string[] {
  const nomi = new Map(FIXED_COLUMNS[tipo].map((c) => [c.key, c.label] as const));
  return COLONNE_NON_LETTE[tipo].map((chiave) => nomi.get(chiave) ?? chiave);
}

/** «1 prodotto», «12 prodotti». */
export function contaElementi(tipo: CatalogObjectType, n: number): string {
  const d = DESTINAZIONI_IMPORT[tipo];
  return `${n} ${n === 1 ? d.singolare : d.plurale}`;
}

/** La frase del passo di conferma. */
export function fraseConferma(tipo: CatalogObjectType, n: number): string {
  const quanti = contaElementi(tipo, n);
  if (tipo === "product") return `Stai per importare ${quanti} nel catalogo articoli (ordini e preventivi edili).`;
  if (tipo === "family") return `Stai per importare ${quanti} nel Listino.`;
  return `Stai per importare ${quanti} in Manodopera e servizi.`;
}
