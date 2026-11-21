export type FlussoAi = "whatsapp" | "ddt" | "silvio" | "assistente" | "preventivo" | "riconciliazione";
export type StatoAi = "in_corso" | "in_attesa" | "completata" | "errore";

export type FaseAi =
  | "messaggio_ricevuto" | "foto_ricevuta" | "vocale_ricevuto" | "richiesta_ricevuta" | "allegato_salvato" | "documento_in_lettura"
  | "prepara_documento" | "riconosce_allegato" | "trascrizione" | "traduzione" | "smistamento"
  | "bolla_accodata" | "bolla_registrata" | "scontrino_letto"
  | "memoria" | "elaborazione" | "strumenti" | "controllo_incassi" | "listino"
  | "voci_preventivo" | "prezzi_preventivo" | "confronto_documenti" | "confronto_ai"
  | "salvataggio" | "invio_risposta" | "risposta_inviata" | "risposta_salvata"
  | "conferma_whatsapp" | "destinazione_ddt" | "da_smistare" | "lettura_pronta" | "lettura_da_riprovare"
  | "bozza_pronta" | "risposta_preventivo" | "proposta_pronta" | "analisi_salvata" | "analisi_riusata" | "prossimo_lotto"
  | "ticket_aperto" | "problema_mezzo_salvato" | "scontrino_registrato" | "rapportino_salvato" | "preventivo_salvato"
  | "pdf_in_preparazione" | "compone_pdf" | "pdf_pronto" | "pdf_inviato" | "terminata" | "errore";

export type PassaggioAi = { fase: FaseAi; at: string; durata_ms?: number };
export type AvanzamentoAi = { completati: number; totale: number };
export type RichiestaAi = {
  tipo: "preventivo" | "riconciliazione";
  id: string;
  risorsa_id?: string;
  esito_id?: string;
};

export type AttivitaAi = {
  id: string;
  company_id: string;
  actor_user_id: string | null;
  attore: string | null;
  assistente: string | null;
  bolla_id: string | null;
  richiesta?: RichiestaAi | null;
  lotti?: AvanzamentoAi | null;
  flusso: FlussoAi;
  stato: StatoAi;
  fase: FaseAi;
  modello: string | null;
  passaggi: PassaggioAi[];
  started_at: string;
  updated_at: string;
  finished_at: string | null;
};

export function idAttivitaValido(id: unknown): id is string {
  return typeof id === "string" && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id);
}

export const idBollaValido = idAttivitaValido;
