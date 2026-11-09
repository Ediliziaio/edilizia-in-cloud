/**
 * L'archivio delle condizioni contrattuali (07/11/2026).
 *
 * Florin: «da qualche parte nelle impostazioni mettere tutte le condizioni, e da lì il sistema pesca le
 * condizioni sia per i preventivi, per i contratti, subappaltatori, committenti — tutto. Evitando di creare
 * doppioni».
 *
 * Qui le regole, senza React e senza database, così si provano da sole:
 *   · da dove pesca le condizioni un documento (la regola è UNA per tutti);
 *   · come un modello diventa il testo stampato;
 *   · cosa si scrive sul documento quando si riscrive una clausola, per sapere poi da dove viene.
 *
 * La regola di lettura, in ordine:
 *   1. il documento ha già la SUA copia  → quella, sempre. Un modello aggiornato non tocca i documenti emessi.
 *   2. altrimenti il modello PREDEFINITO dell'ambito, per quell'azienda.
 *   3. altrimenti il testo di sistema.
 */

/** I cinque tipi di documento che hanno condizioni contrattuali. */
export const AMBITI_CONDIZIONI = [
  "preventivo", "appalto", "commessa", "subappalto", "acquisto", "fattura", "manutenzione", "lavoro",
] as const;
export type AmbitoCondizioni = (typeof AMBITI_CONDIZIONI)[number];

export const NOMI_AMBITI: Record<AmbitoCondizioni, string> = {
  preventivo: "Preventivi e computi",
  appalto: "Contratto col committente",
  commessa: "Lavori extra e varianti",
  subappalto: "Subappaltatori",
  acquisto: "Ordini e richieste d'offerta",
  fattura: "Fatture",
  manutenzione: "Contratti di manutenzione",
  lavoro: "Contratti di lavoro",
};

/** Dove finiscono davvero, queste condizioni: detto come lo direbbe un titolare. */
export const DOVE_SI_USA: Record<AmbitoCondizioni, string> = {
  preventivo: "In fondo a ogni preventivo e computo che mandi al cliente",
  appalto: "Nel contratto d'appalto che il committente firma",
  commessa: "Nei lavori extra e nelle varianti che il cliente approva a lavori aperti",
  subappalto: "Nel contratto che fai firmare al subappaltatore",
  acquisto: "Negli ordini e nelle richieste d'offerta ai fornitori",
  fattura: "In fondo alla fattura, sotto i totali",
  manutenzione: "Nei contratti di manutenzione e di assistenza",
  lavoro: "Nelle lettere di assunzione e nei contratti del personale",
};

/** I tipi che i documenti leggono davvero. Gli altri li si può già scrivere, ma non escono ancora su niente. */
export const AMBITI_COLLEGATI: ReadonlySet<AmbitoCondizioni> = new Set(["preventivo", "appalto", "commessa", "subappalto", "fattura"]);

/** A chi va il documento: serve a raggruppare gli ambiti nella schermata. */
export const CONTROPARTE: Record<AmbitoCondizioni, "cliente" | "fornitore" | "subappaltatore" | "dipendente"> = {
  preventivo: "cliente", appalto: "cliente", commessa: "cliente", fattura: "cliente", manutenzione: "cliente",
  acquisto: "fornitore", subappalto: "subappaltatore", lavoro: "dipendente",
};

export interface Clausola {
  /** L'id nella libreria, quando la clausola viene da lì; null se è scritta a mano nel modello. */
  clausola_id?: string | null;
  titolo: string;
  testo: string;
  /** Art. 1341 c.2 c.c.: il cliente la approva a parte. */
  vessatoria?: boolean;
}

export interface ModelloCondizioni {
  id: string;
  nome: string;
  ambito: AmbitoCondizioni;
  predefinito: boolean;
  attivo: boolean;
  versione: number;
  clausole: Clausola[];
}

/** Da dove vengono le condizioni di un documento: si scrive sul documento, non sul modello. */
export interface OrigineCondizioni {
  modello_id?: string | null;
  modello_nome?: string | null;
  versione?: number | null;
  /** I titoli delle clausole cambiate a mano su QUESTO documento. */
  clausole_riscritte?: string[];
  riscritte_da?: string | null;
  riscritte_il?: string | null;
  /** Quando il testo del modello è stato copiato dentro il documento (emissione). */
  congelate_il?: string | null;
}

/**
 * Il testo di un modello si compone in un posto solo (07/11/2026): le regole stanno nel modulo
 * condiviso con le edge function, perché il contratto d'appalto lo scrive il server e il preventivo
 * il browser — e devono comporre lo stesso identico testo. Qui si ri-espongono, nulla si riscrive.
 */
import * as condiviso from "../../../supabase/functions/_shared/condizioniArchivio";

const haParole = condiviso.haParole;
/** Le clausole buone di un modello: niente righe vuote, nell'ordine in cui sono. */
export const clausoleDelModello = (modello: Pick<ModelloCondizioni, "clausole"> | null | undefined): Clausola[] =>
  condiviso.clausoleBuone(modello as condiviso.ModelloArchivio | null) as Clausola[];
/** Il testo stampabile di un modello: un titolo e un testo per clausola. */
export const testoDelModello = (modello: Pick<ModelloCondizioni, "clausole"> | null | undefined): string =>
  condiviso.testoDelModello(modello as condiviso.ModelloArchivio | null);
/** Il titolo si ripete già nella prima riga del testo? Allora non si scrive due volte. */
export const titoloGiaNelTesto = (titolo: string, testo: string): boolean =>
  condiviso.titoloGiaNelTesto(titolo, testo);
/** Il modello come va nel PDF: HTML con titoli e stili, con le regole che il PDF usa per rileggerlo. */
export const htmlDelModello = (modello: Pick<ModelloCondizioni, "clausole"> | null | undefined): string =>
  condiviso.htmlDelModello(modello as condiviso.ModelloArchivio | null);
/** Il testo senza tag: per la causale della fattura, per l'AI, per un riassunto. */
export const testoPiano = condiviso.testoPiano;
/** La regola unica di cosa stampa un PDF: vedi `condizioniDelPdf` nel modulo condiviso. */
export const condizioniDelPdf = condiviso.condizioniDelPdf;
export type FonteCondizioniPdf = condiviso.FonteCondizioniPdf;

/** Il modello che vale per un ambito: il predefinito attivo. Niente predefinito, niente modello. */
export function modelloPredefinito(
  modelli: ReadonlyArray<ModelloCondizioni>,
  ambito: AmbitoCondizioni,
): ModelloCondizioni | null {
  return modelli.find((m) => m.ambito === ambito && m.predefinito && m.attivo) ?? null;
}

/**
 * Le clausole da cui parte chi non ha ancora niente: testi generici, da rileggere e adattare.
 * Non sono un parere legale: servono a non far trovare al titolare un foglio bianco.
 */
export const CLAUSOLE_DI_PARTENZA: ReadonlyArray<Clausola & { categoria: string }> = [
  { categoria: "Pagamenti", titolo: "Modalità di pagamento", testo: "Il corrispettivo è dovuto secondo le scadenze indicate nel documento. In mancanza di diversa indicazione: 30% alla firma, 40% all'inizio dei lavori, saldo alla consegna." },
  { categoria: "Pagamenti", titolo: "Ritardato pagamento", testo: "Sui pagamenti non effettuati alla scadenza decorrono gli interessi di mora di legge (d.lgs. 231/2002). L'impresa può sospendere i lavori dopo quindici giorni dal sollecito scritto.", vessatoria: true },
  { categoria: "Lavori", titolo: "Tempi di esecuzione", testo: "I tempi indicati decorrono dalla consegna dell'area di lavoro e si intendono salvo cause non imputabili all'impresa: condizioni meteo avverse, ritardi di forniture, varianti richieste dal committente, permessi non rilasciati." },
  { categoria: "Lavori", titolo: "Varianti e lavori extra", testo: "Ogni lavorazione non prevista è oggetto di variante scritta, con prezzo e tempi concordati prima dell'esecuzione. I lavori extra eseguiti su richiesta verbale sono comunque dovuti se documentati." },
  { categoria: "Garanzie", titolo: "Garanzia sulle opere", testo: "Le opere sono garantite nei termini di legge (artt. 1667 e 1669 c.c.). La garanzia non copre danni da uso improprio, mancata manutenzione o interventi di terzi." },
  { categoria: "Consegna", titolo: "Consegna e collaudo", testo: "A fine lavori si redige il verbale di consegna. Trascorsi quindici giorni senza contestazioni scritte, l'opera si intende accettata." },
  { categoria: "Legale", titolo: "Foro competente", testo: "Per ogni controversia è competente il foro del luogo in cui ha sede l'impresa, salvo il foro del consumatore quando il committente è un privato.", vessatoria: true },
];

export interface CondizioniRisolte {
  testo: string;
  /** Da dove viene: la copia del documento, il modello predefinito, o il testo di sistema. */
  fonte: "documento" | "modello" | "sistema" | "nessuna";
  modello?: ModelloCondizioni | null;
}

/**
 * La regola unica: cosa stampa un documento. Vale per preventivi, computi, commesse, subappalti e
 * contratti di lavoro: cambia solo l'ambito.
 */
export function condizioniDelDocumento(a: {
  /** La copia già sul documento: se c'è, vince sempre. */
  testoDelDocumento?: string | null;
  ambito: AmbitoCondizioni;
  modelli: ReadonlyArray<ModelloCondizioni>;
  /** Il testo di sistema, quando l'azienda non ha ancora un modello suo. */
  testoDiSistema?: string | null;
}): CondizioniRisolte {
  if (haParole(a.testoDelDocumento)) return { testo: String(a.testoDelDocumento), fonte: "documento" };
  const modello = modelloPredefinito(a.modelli, a.ambito);
  const dalModello = testoDelModello(modello);
  if (haParole(dalModello)) return { testo: dalModello, fonte: "modello", modello };
  if (haParole(a.testoDiSistema)) return { testo: String(a.testoDiSistema), fonte: "sistema" };
  return { testo: "", fonte: "nessuna" };
}

/**
 * Cosa scrivere sul documento quando si EMETTE: la copia del testo e da dove viene. Da chiamare quando il
 * documento parte verso il cliente, non in anteprima. Se il documento ha già la sua copia, non si tocca.
 */
export function daCongelare(
  a: Parameters<typeof condizioniDelDocumento>[0],
  adesso = new Date().toISOString(),
): { condizioni_testo: string; condizioni_origine: OrigineCondizioni } | null {
  const risolte = condizioniDelDocumento(a);
  if (risolte.fonte === "documento" || risolte.fonte === "nessuna") return null;
  return {
    condizioni_testo: risolte.testo,
    condizioni_origine: {
      modello_id: risolte.modello?.id ?? null,
      modello_nome: risolte.modello?.nome ?? null,
      versione: risolte.modello?.versione ?? null,
      congelate_il: adesso,
    },
  };
}

/**
 * Cosa scrivere sul documento quando qualcuno RISCRIVE le condizioni: il testo nuovo e la traccia di chi e
 * quando. La traccia di prima (quale modello) resta: serve a dire «partiva dal modello X, versione 3».
 */
export function daRiscrivere(
  testoNuovo: string,
  origine: OrigineCondizioni | null | undefined,
  chi: string | null | undefined,
  clausoleRiscritte: string[] = [],
  adesso = new Date().toISOString(),
): { condizioni_testo: string; condizioni_origine: OrigineCondizioni } {
  return {
    condizioni_testo: testoNuovo,
    condizioni_origine: {
      ...(origine ?? {}),
      clausole_riscritte: clausoleRiscritte.length ? clausoleRiscritte : origine?.clausole_riscritte,
      riscritte_da: chi?.trim() || null,
      riscritte_il: adesso,
    },
  };
}

/** Una riga sola da mostrare sulla scheda: da dove vengono le condizioni che si stanno guardando. */
export function raccontaOrigine(origine: OrigineCondizioni | null | undefined, fonte: CondizioniRisolte["fonte"]): string {
  const giorno = (iso: string | null | undefined) => {
    const d = iso ? new Date(iso) : null;
    return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("it-IT") : null;
  };
  if (origine?.riscritte_il) {
    const chi = origine.riscritte_da ? ` da ${origine.riscritte_da}` : "";
    const base = origine.modello_nome ? ` (partivano dal modello «${origine.modello_nome}»${origine.versione ? `, versione ${origine.versione}` : ""})` : "";
    return `Riscritte per questo documento${chi}${giorno(origine.riscritte_il) ? ` il ${giorno(origine.riscritte_il)}` : ""}${base}.`;
  }
  if (origine?.congelate_il && origine.modello_nome) {
    return `Dal modello «${origine.modello_nome}»${origine.versione ? `, versione ${origine.versione}` : ""}, fissate il ${giorno(origine.congelate_il)}. Cambiare il modello non tocca più questo documento.`;
  }
  if (fonte === "modello") return "Dal modello predefinito dell'azienda: finché il documento non parte, segue il modello.";
  if (fonte === "sistema") return "Testo di sistema: l'azienda non ha ancora un modello suo per questo tipo di documento.";
  return "Nessuna condizione impostata.";
}

export type { ModelloArchivio } from "../../../supabase/functions/_shared/condizioniArchivio";

/** La parte del contratto d'appalto che viene dall'archivio (dal titolo «Condizioni generali dell'impresa» in fondo). */
export const condizioniDelContratto = (md: string | null | undefined): string => condiviso.condizioniDelContratto(md);
