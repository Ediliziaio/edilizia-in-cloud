export type Sesso = "M" | "F" | "altro";
export type TipoContratto = "indeterminato" | "determinato" | "apprendistato" | "collaborazione" | "partita_iva" | "stagionale" | "tirocinio" | "consulenza" | "part_time" | "interinale";
export type OrarioTipo = "fisso" | "flessibile" | "turnista" | "standard" | "turni" | "part_time";
export type TimbraturaTipo = "entrata" | "uscita" | "pausa_inizio" | "pausa_fine" | "inizio_pausa" | "fine_pausa" | "missione_start" | "missione_end";
export type TimbrataFonte = "web" | "app" | "nfc" | "qr" | "manuale" | "badge" | "admin";
export type GiornataStato = "presente" | "assente" | "ferie" | "permesso" | "malattia" | "smart_working" | "trasferta" | "festivita" | "infortunio" | "maternita" | "paternita" | "lutto" | "rol" | "non_lavorativo" | "missione";
export type RichiestaTipo = "ferie" | "permesso" | "malattia" | "straordinario" | "cambio_turno" | "rimborso" | "altro" | "rol" | "infortunio" | "maternita" | "paternita" | "lutto" | "smart_working" | "trasferta" | "formazione";
export type RichiestaStato = "in_attesa" | "approvata" | "rifiutata" | "annullata" | "revocata";

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
  // Organigramma fields
  responsabile_id: string | null;
  mansione: string | null;
  reparto: string | null;
  posizione_organigramma: number;
  orario_inizio: string | null;
  orario_fine: string | null;
  pausa_pranzo_minuti: number;
  giorni_lavorativi: string[];
  ferie_anno_giorni: number;
  permessi_anno_ore: number;
  rol_anno_ore: number;
  ferie_residue: number;
  permessi_residui_ore: number;
  rol_residuo_ore: number;
  badge_id: string | null;
  pin_timbratura: string | null;
  colore_avatar: string;
  nazionalita: string;
  stato_civile: string | null;
  luogo_nascita: string | null;
  citta_residenza: string | null;
  cap_residenza: string | null;
  telefono_privato: string | null;
  email_privata: string | null;
  contatto_emergenza_nome: string | null;
  contatto_emergenza_telefono: string | null;
  ccnl: string;
  note_interne: string | null;
  // joined
  sede?: HrSede;
  responsabile?: HrProfilo;
  // from employees join
  employee_first_name?: string;
  employee_last_name?: string;
  employee_email?: string;
  employee_phone?: string;
}

export interface OrgTreeNode extends HrProfilo {
  children: OrgTreeNode[];
  depth: number;
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
