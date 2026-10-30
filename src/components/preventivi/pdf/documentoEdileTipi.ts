import type { TipografiaDocumento } from "./temaDocumento";
import type { PaginaLibera, VoceOrdine } from "./ordineCapitoli";

/**
 * Tipi del documento edile condiviso («Piano dei lavori»).
 *
 * Gli otto preventivatori edili (ristrutturazione, bagni, tetti, climatizzazione,
 * elettrico, termoidraulico, pavimenti, piscine) avevano ciascuno la propria
 * copia del PDF, nate uguali e poi andate ognuna per conto suo. Ora c'è UN
 * documento: ogni modulo lo alimenta con questi dati, tramite un adattatore di
 * poche righe. Un miglioramento grafico vale per tutti, una volta sola.
 */

import type { ChiaveBlocco, ContenutoBlocco } from "../../../../supabase/functions/_shared/blocchiPreventivo";
import type { VotoOnline } from "../../../../supabase/functions/_shared/recensioniOnline";
import type { PaginaConTestata, TestataPagina } from "../../../../supabase/functions/_shared/testatePagine";
export interface DocEdileVoce {
  id: string;
  descrizione: string;
  unitaMisura: string | null;
  quantita: number;
  prezzoUnitario: number;
  importo: number;
  /** Citazione della fonte del prezzo (base d'asta): discreta, solo se c'è. */
  fonte?: string | null;
  /** La foto del prodotto del listino, già incorporata (data URL): miniatura a sinistra della riga. Senza: niente. */
  foto?: string | null;
  /** La descrizione del prodotto del listino, accorciata: sotto il nome. Senza: niente. */
  dettaglio?: string | null;
  /** Solo documento interno (show_margine): margine in euro della voce. */
  /** null: la riga non ha un costo, il suo margine non si può dire. */
  margineEur?: number | null;
}

export interface DocEdileCapitolo {
  fuoriTotale?: boolean;
  nome: string;
  voci: DocEdileVoce[];
  subtotale: number;
}

export interface DocEdileTotali {
  mostraSconti?: boolean;
  imponibileLordo: number;
  scontoEur: number;
  scontoPct: number;
  imponibile: number;
  iva: number;
  ivaPct: number;
  aliquoteIva?: Array<{ aliquota: number | null; valore: number }>;
  totale: number;
  detrazionePct: number;
  detrazioneEur: number;
  costoTot: number;
  /** null: costi incompleti, il margine non si può dire (05/10/2026). */
  margineEur: number | null;
  marginePct: number | null;
  /**
   * Il prezzo pieno è scritto a mano in Economia, al posto della somma delle
   * righe: le righe possono essere a 0 €, e il documento non ne mostra gli
   * importi né i subtotali — solo le lavorazioni, e il prezzo nell'investimento.
   */
  prezzoManuale?: boolean;
  /** IVA divisa fra 10% e 22% (beni significativi, DM 29/12/1999); assente = un'aliquota sola. */
  ivaRipartita?: { beniSignificativi: number; imponibile10: number; imponibile22: number; iva10: number; iva22: number } | null;
}

export interface DocEdileOpzioniComputo {
  livello: "dettagliato" | "sintetico" | "corpo";
  mostraPrezzi: boolean;
  mostraQta: boolean;
  mostraSubtotali: boolean;
}

export interface DocEdileAzienda {
  nome: string;
  indirizzo: string | null;
  telefono: string | null;
  email: string | null;
  partitaIva: string | null;
  sito: string | null;
  logoUrl: string | null;
  /** Il logo chiaro del kit del marchio: va sulla copertina quando il fondo è scuro. */
  logoChiaroUrl: string | null;
  /** Il timbro dell'impresa (data URL), stampato sopra la sua firma. Solo il preventivo generico. */
  timbroUrl?: string | null;
  /** Chi firma per l'impresa, scritto nel modello: va sotto il nome, «Impresa Srl — Mario Rossi». */
  firmatario?: string | null;
  /** Il voto su Google, Trustpilot… scritto nel Profilo azienda (vuoto = non esce). */
  votiOnline: VotoOnline[];
}

export interface DocEdileFoto {
  id: string;
  url: string;
  didascalia?: string | null;
  luogo?: string | null;
}

export interface DocEdileVoceElenco { titolo: string; descrizione?: string | null }
export interface DocEdileTestimonianza {
  autore: string;
  ruolo?: string | null;
  testo: string;
  /** Le stelle date dal cliente (1-5), se l'azienda le ha riportate. */
  voto?: number | null;
}
export interface DocEdileFase { fase: string; durata?: string | null; descrizione?: string | null }
export interface DocEdileFaq { domanda: string; risposta: string }

/** Ciò che cambia da un settore all'altro: parole, non impaginazione. */
export interface DocEdileModulo {
  /** "ristrutturazione", "bagni"… */
  chiave: string;
  /** Nell'intestazione: «Piano dei lavori · Ristrutturazione». */
  etichetta: string;
  /** Titolo di copertina quando il modello non ne ha uno. Una parola fra
   *  asterischi va in corsivo: «Il *progetto* per la tua casa.» */
  titoloCopertina: string;
  sottotitoloCopertina: string;
  /** Titolo del capitolo del computo: «Il piano dei lavori», «La fornitura»… */
  titoloComputo: string;
}

/** I campi del modello che il documento legge, con nomi unici per tutti i moduli. */
/** Una foto di un blocco: `diSerie` quando viene dalla libreria (sotto esce la nota). */
export interface DocEdileFotoBlocco {
  src: string;
  diSerie: boolean;
}

export type DocEdileBlocco = Omit<ContenutoBlocco, "foto"> & { foto: DocEdileFotoBlocco[] };

export interface DocEdileModello {
  /** La tipografia scelta dall'azienda: lineare, editoriale o classica. */
  tipografia: TipografiaDocumento;
  colorePrimario: string | null;
  coloreSecondario: string | null;
  coloreAccento: string | null;

  copertina: {
    occhiello: string | null;
    titolo: string | null;
    sottotitolo: string | null;
    immagineUrl: string | null;
    logoUrl: string | null;
    coloreFondo: string | null;
    coloreTesto: string | null;
    /** 0…1 */
    opacitaVelo: number | null;
    stileVelo: "flat" | "gradient" | "gradient_diag" | "vignette";
    allineamento: "left" | "center";
    verticale: "top" | "center" | "bottom";
    posizioneLogo: "top_left" | "top_center" | "top_right" | "hidden";
    scalaLogo: number;
    decorazione: "square" | "circle" | "line" | "pattern" | "none";
    mostraDecorazione: boolean;
    mostraScheda: boolean;
    corpoOcchiello: number | null;
    corpoTitolo: number | null;
    corpoSottotitolo: number | null;
  };

  chiSiamoHtml: string | null;
  chiSiamoFotoUrl: string | null;
  mostraChiSiamo: boolean;
  esigenze: DocEdileVoceElenco[];
  soluzione: DocEdileVoceElenco[];
  usp: DocEdileVoceElenco[];
  percorso: DocEdileVoceElenco[];
  mostraPercorso: boolean;
  garanzie: DocEdileVoceElenco[];
  faq: DocEdileFaq[];
  mostraGaranzie: boolean;
  testimonianze: DocEdileTestimonianza[];
  cronoprogramma: DocEdileFase[];
  mostraCronoprogramma: boolean;
  galleriaLavori: DocEdileFoto[];
  /**
   * Occhiello, titolo e introduzione di «Dicono di noi», domande, garanzie e lavori:
   * di serie, o riscritti dall'azienda (vedi _shared/testatePagine.ts).
   */
  testate: Record<PaginaConTestata, TestataPagina>;

  pagamentoHtml: string | null;
  testoValidita: string | null;
  giorniValidita: number | null;
  testoPiePagina: string | null;
  mostraPieVersione: boolean;
  mostraPieLegale: boolean;
  mostraMargine: boolean;
  finanziamentoPromo: unknown;
  /** Già con i merge tag risolti: righe tipizzate pronte da impaginare. */
  condizioniLegali: import('../../../../supabase/functions/_shared/testoRiccoContratto').RigaContratto[];
  /** Le clausole che il cliente approva con una seconda firma (art. 1341 c.c.). */
  clausoleDaApprovare: string[];
  /** L'azienda allega il modulo di recesso (interruttore nel modello, spento di serie). */
  conRecesso: boolean;
  /**
   * I blocchi della libreria (come funziona, cosa è compreso, protezione…): testi di
   * serie del settore con sopra quelli dell'azienda, foto già convertite per il PDF.
   * Se escono lo decide l'ordine dei capitoli, come per gli altri.
   */
  blocchi: Record<ChiaveBlocco, DocEdileBlocco>;
  /**
   * La foto dei prossimi passi, in chiusura: di serie per settore (il risultato
   * finito), cambiata o tolta dall'azienda. Null = niente foto.
   */
  fotoChiusura: DocEdileFotoBlocco | null;
  /**
   * Le foto che riempiono la pagina quando un capitolo finisce a metà foglio,
   * per capitolo del documento (vedi RIEMPIMENTI_EDILI in _shared/blocchiPreventivo).
   */
  fotoRiempimento: Partial<Record<string, DocEdileFotoBlocco>>;
  /** L'ordine dei capitoli scelto dall'azienda (vuoto = quello di serie). */
  ordineCapitoli: VoceOrdine[];
  /** Le pagine scritte dall'azienda: certificazioni, showroom, un lavoro di cui va fiera. */
  pagineLibere: PaginaLibera[];
}

export interface DocEdileDati {
  titoloDocumento?: string;
  filigrana?: string | null;
  firmaOnlineUrl?: string | null;
  titoloChiusura?: string | null;
  passiChiusura?: DocEdileVoceElenco[];
  mostraChiusura?: boolean;
  /** Ordine unificato dei capitoli standard e delle sezioni tecniche. */
  ordineDocumento?: string[];
  /** Allegati del settore, impaginati dallo stesso motore del documento. */
  sezioniTecniche?: Array<{
    id: string;
    titolo: string;
    testo?: string | null;
    righe?: Array<{ etichetta: string; valore: string }>;
    immagine?: string | null;
    sovrapposizione?: { larghezza: number; altezza: number; poligoni: string[] };
    nota?: string | null;
    grafico?: { etichette: string[]; serie: Array<{ nome: string; valori: number[] }> };
  }>;
  /** Opt-in only for browser-local drafts; never implies issuance or acceptance. */
  bozzaLocale?: { ivaDaDefinire: boolean; soloConfigurazione?: boolean };
  modulo: DocEdileModulo;
  codice: string | null;
  /** «Mario Rossi» */
  cliente: string;
  /** «C.F. …» o «P.IVA … · C.F. …»: nella pagina di accettazione, accanto al committente. */
  datiFiscaliCliente?: string | null;
  /** Solo il nome, per il saluto: «Mario». */
  clienteNome: string | null;
  /** Preventivo cointestato: «Anna Bianchi», che firma accanto al cliente. */
  cointestatario?: string | null;
  /** «Via Roma 1, 20100 Milano, MI» */
  cantiere: string;
  localita: string | null;
  tipoIntervento: string | null;
  /** Fatti dell'intervento, già formattati: «Superficie» → «90 mq». */
  scheda: Array<{ etichetta: string; valore: string }>;
  azienda: DocEdileAzienda;
  modello: DocEdileModello;
  capitoli: DocEdileCapitolo[];
  totali: DocEdileTotali;
  fotoProgetto: DocEdileFoto[];
  opzioniComputo: DocEdileOpzioniComputo;
  /** false = il preventivo ha chiesto di nascondere la rata. */
  mostraFinanziamento: boolean;
  /** Le rate scelte per questo preventivo; senza, vale il numero del modello. */
  finanziamentoRate?: number | null;
  /** Le rate di questo preventivo (piano di pagamento). Vuoto: nel PDF resta la frase del modello. */
  pianoPagamento?: { righe: Array<{ nome: string; quando: string; percent: number; importo: number }>; note: string | null } | null;
  /** La finanziaria scelta per questo preventivo (TAN, rata e importo della sua tabella); senza, vale la promo del modello. */
  finanziamentoScelta?: { tanPct: number | null; rata: number | null; importo: number | null } | null;
}
