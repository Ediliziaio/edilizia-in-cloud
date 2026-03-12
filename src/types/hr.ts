export type Sesso = "M" | "F" | "altro";
export type TipoContratto = "indeterminato" | "determinato" | "apprendistato" | "collaborazione" | "partita_iva" | "stagionale";
export type OrarioTipo = "fisso" | "turnista" | "flessibile";
export type TimbraturaTipo = "entrata" | "uscita" | "pausa_inizio" | "pausa_fine";
export type TimbrataFonte = "web" | "app" | "nfc" | "qr" | "manuale";
export type GiornataStato = "presente" | "assente" | "ferie" | "permesso" | "malattia" | "smart_working" | "trasferta" | "festivita";
export type RichiestaTipo = "ferie" | "permesso" | "malattia" | "straordinario" | "cambio_turno" | "rimborso" | "altro";
export type RichiestaStato = "in_attesa" | "approvata" | "rifiutata" | "annullata";

export interface HrSede {
  id: string;
  company_id: string;
  nome: string;
  indirizzo: string | null;
  citta: string | null;
  provincia: string | null;
  cap: string | null;
  lat: number | null;
  lng: number | null;
  raggio_mt: number;
  attiva: boolean;
  created_at: string;
}

export interface HrFestivita {
  id: string;
  company_id: string;
  data: string;
  descrizione: string;
  ricorrente: boolean;
  created_at: string;
}

export interface HrProfilo {
  id: string;
  company_id: string;
  user_id: string | null;
  employee_id: string | null;
  nome: string;
  cognome: string;
  codice_fiscale: string | null;
  sesso: Sesso | null;
  data_nascita: string | null;
  telefono: string | null;
  email: string | null;
  indirizzo: string | null;
  iban: string | null;
  foto_url: string | null;
  data_assunzione: string | null;
  data_cessazione: string | null;
  tipo_contratto: TipoContratto;
  ore_settimanali: number;
  ore_giornaliere: number;
  orario_tipo: OrarioTipo;
  sede_id: string | null;
  matricola: string | null;
  livello_ccnl: string | null;
  note: string | null;
  attivo: boolean;
  created_at: string;
  updated_at: string;
  // joined
  sede?: HrSede;
}

export interface HrTimbratura {
  id: string;
  company_id: string;
  profilo_id: string;
  tipo: TimbraturaTipo;
  timestamp: string;
  data_evento: string;
  ora_evento: string;
  lat: number | null;
  lng: number | null;
  sede_id: string | null;
  fonte: TimbrataFonte;
  ip_address: string | null;
  note: string | null;
  validata: boolean;
  validata_da: string | null;
  created_at: string;
  // joined
  profilo?: HrProfilo;
}

export interface HrGiornata {
  id: string;
  company_id: string;
  profilo_id: string;
  data: string;
  stato: GiornataStato;
  ore_previste: number;
  ore_lavorate: number;
  ore_straordinario: number;
  ore_pausa: number;
  ore_mancanti: number;
  prima_entrata: string | null;
  ultima_uscita: string | null;
  note: string | null;
  anomalia: boolean;
  anomalia_motivo: string | null;
  bloccata: boolean;
  created_at: string;
  updated_at: string;
  // joined
  profilo?: HrProfilo;
}

export interface HrRichiesta {
  id: string;
  company_id: string;
  profilo_id: string;
  tipo: RichiestaTipo;
  data_inizio: string;
  data_fine: string;
  ore_richieste: number | null;
  motivo: string | null;
  stato: RichiestaStato;
  approvata_da: string | null;
  approvata_il: string | null;
  note_risposta: string | null;
  allegato_url: string | null;
  created_at: string;
  updated_at: string;
  // joined
  profilo?: HrProfilo;
}
