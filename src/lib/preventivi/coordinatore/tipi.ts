/**
 * Coordinatore del preventivo: i tipi condivisi tra gli agenti.
 *
 * Gli agenti di recupero (profilo, listini, storico) sono letture e regole, non chiamate AI: l'AI resta
 * dove serve interpretare (Silvio che legge la richiesta e gli allegati). Qui dentro non c'è niente che
 * possa inventare un codice, un prezzo o una quantità: ogni numero proposto ha una riga del database o
 * una regola dell'azienda da cui viene, e lo dice.
 */

/** Da dove può arrivare un prezzo. L'ordine con cui si preferiscono è `PRIORITA_PREDEFINITA`. */
export type TipoFonte =
  | "contratto"
  | "offerta_fornitore"
  | "listino_aziendale"
  | "acquisto_recente"
  | "storico"
  | "prezzario"
  | "stima";

/** Un prezzo di vendita e un costo non si confrontano mai tra loro. */
export type NaturaPrezzo = "vendita" | "costo";

export interface CandidatoPrezzo {
  /** Stabile tra un giro e l'altro: tipo + riga d'origine. */
  id: string;
  tipo: TipoFonte;
  natura: NaturaPrezzo;
  /** Euro per unità, già al netto degli sconti scritti sulla fonte. */
  valore: number;
  unita: string;
  /** Come si legge a schermo: «Listino aziendale», «Listino Rossi 2026», «Preventivo PRV/2026/12 accettato». */
  etichetta: string;
  /** Codice della voce o numero del documento. */
  riferimento: string;
  /** La data a cui il prezzo è riferito (ISO), se la fonte la conserva. */
  data: string | null;
  validoAl: string | null;
  scaduto: boolean;
  /** Ciò che rende il prezzo confrontabile o no: quantità, stato del preventivo, sconto applicato. */
  condizioni: string;
  corrispondenza: "codice" | "descrizione";
  /** `false`: si mostra per confronto (prezzo solo proposto, rifiutato, o a quantità troppo diversa) ma non si sceglie. */
  selezionabile: boolean;
}

/** La voce come la vede il coordinatore: solo ciò che serve, mai i costi se il ruolo non li vede. */
export interface VoceRichiesta {
  id: string;
  capitolo: string;
  codice: string;
  descrizione: string;
  unita: string;
  quantita: number | null;
  prezzo: number | null;
  /** `null` anche quando l'utente non può vedere i costi. */
  costo: number | null;
  /** Il prezzo l'ha scritto una persona: non si sovrascrive, al massimo si propone. */
  manuale: boolean;
  opzionale: boolean;
  /** Lavorazione che si quantifica dopo: la quantità mancante non è una domanda. */
  daQuantificare: boolean;
}

export interface ProfiloAzienda {
  margineObiettivoPct: number | null;
  margineMinimoPct: number | null;
  /** Il listino aziendale ha voci attive: senza, le voci senza prezzo sono attese, non un errore. */
  listinoPresente: boolean;
}

export type RegolaPrezzo = { tipo: "margine" | "ricarico"; pct: number };

export type StatoVerifica = "verificata" | "da_confermare" | "manuale" | "stima" | "senza_fonte";

export interface PropostaVoce {
  prezzo?: number;
  costo?: number;
  /** Testo che può finire nel PDF del cliente: mai un costo, mai un fornitore. */
  fonte: string;
  /** La regola che ha prodotto il prezzo quando non viene da una fonte: «margine 30% sul costo 100,00 €». */
  regola?: string;
  /** Sovrascrive un prezzo scritto a mano: si applica solo se l'utente la accetta, mai in blocco. */
  suManuale: boolean;
}

export interface EsitoVoce {
  voceId: string;
  stato: StatoVerifica;
  vendita: CandidatoPrezzo | null;
  costo: CandidatoPrezzo | null;
  candidati: CandidatoPrezzo[];
  conflitti: string[];
  proposta: PropostaVoce | null;
  avvisi: string[];
  marginePct: number | null;
}

export type GravitaControllo = "domanda" | "avviso";
export interface Controllo {
  gravita: GravitaControllo;
  /** Chiave stabile del tipo di controllo, per i test e per contare. */
  codice: string;
  voceId: string | null;
  testo: string;
}

export const ETICHETTE_FONTE: Record<TipoFonte, string> = {
  contratto: "Prezzo concordato col cliente",
  offerta_fornitore: "Listino o offerta del fornitore",
  listino_aziendale: "Listino aziendale",
  acquisto_recente: "Acquisto recente",
  storico: "Storico dei preventivi",
  prezzario: "Prezzario",
  stima: "Stima",
};

/**
 * L'ordine di preferenza quando più fonti hanno un prezzo per la stessa voce. Vale separatamente per i
 * prezzi di vendita e per i costi. Un prezzo scaduto viene sempre dopo tutti quelli validi.
 */
export const PRIORITA_PREDEFINITA: readonly TipoFonte[] = [
  "contratto", "offerta_fornitore", "listino_aziendale", "acquisto_recente", "storico", "prezzario", "stima",
];
