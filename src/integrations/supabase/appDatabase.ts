import type { FishAssistanceCase } from "../../../shared/fish/assistance";
import type { PrezziMimit } from "../../../shared/carburanti/mimit";
import type { TrattaViaggio, Viaggio } from "@/lib/mezzi/viaggi";
import type { Database, Json } from "./types";
import type { AttivitaAi } from "../../../shared/aiAttivita";
import type {
  AvanzamentoRegistratoCampo, CantiereTecnico, PersonaAccessoTecnico, SchedaCantiere,
  SezioneSchedaCantiere, TipoVisitaCampo, VisitaRegistrataCampo,
} from "@/lib/campo/schedaCantiere";
/** Additive contract until the next full generated schema refresh. */
type Staff = Database["public"]["Tables"]["staff_permissions"];
type BankPermissions = { can_view_bank_balances: boolean; can_reconcile_bank_transactions: boolean };
type OrderAttachment = Database["public"]["Tables"]["order_attachments"];
type CantiereFields = { cantiere_tipo: string | null };
type QrCantiereRow = { order_id: string; token: string; documento_ids: string[]; revisione: string };
type MediaFolder = Database["public"]["Tables"]["media_library_folders"];
export type DriveFolderMode = "automatic" | "manual";
export type DriveFileRow = { id: string; company_id: string; folder_id: string | null; name: string; mime_type: string; size_bytes: number; storage_path: string; shared: boolean; created_by: string | null; created_at: string };
type Tasks = Database["public"]["Tables"]["tasks"];
type Account = Database["public"]["Tables"]["bank_accounts"];
type GiornataMezzo = Database["public"]["Tables"]["mezzi_giornate"];
type Quote = Database["public"]["Tables"]["quotes"];
export type PuntoMezzoMappa = {
  nome: string; fonte: string; order_id?: string | null; lat?: number | null; lng?: number | null;
  quando?: string | null; dal?: string;
};
export type AttrezzaturaGiornoMappa = {
  id: string; scheda_id: string; nome: string; posizione: PuntoMezzoMappa | null; custode: string | null;
  a_bordo_id: string | null; a_bordo_nome: string | null; quantita: number | null; unita_misura: string | null;
};
export type MezzoGiornoMappa = {
  id: string; nome: string; targa: string | null; tipo: string; stradale: boolean; unita: string;
  posizione: PuntoMezzoMappa | null; destinazione: PuntoMezzoMappa | null; destinazioni: number;
  metri_registrati: number | null; metri_stimati: number | null; fonti_registrate: string[];
  contaore: number | null; contaore_aggiornato: string | null;
  attrezzatura?: AttrezzaturaGiornoMappa;
  posizioneVeicolo?: PuntoMezzoMappa;
};
export type PuntoStoricoMezzo = { lat: number | null; lng: number | null; fonte: string };
export type ViaggioStoricoMezzo = {
  id: string; partenza: string; arrivo: string; stato: "inviato" | "verificato";
  fonte: "contatore" | "dichiarati" | "stimati" | null; km: number | null;
  tratte: { da: string; a: string; partenza: PuntoStoricoMezzo | null; arrivo: PuntoStoricoMezzo | null }[];
};
export type StoricoPercorsiMezzo = {
  totali: { registrati: number | null; stimati: number | null; viaggi: number; senza_km: number };
  items: ViaggioStoricoMezzo[];
};
export type TipoCarburante = "gasolio" | "benzina" | "nessuno";
export type RiferimentoCarburante = { zona: string | null; zona_impostata: string | null; preferisci_mimit: boolean };
export type ConfigCarburanteMezzo = {
  riferimento?: RiferimentoCarburante | null;
  zone?: { chiave: string; nome: string }[];
  stima?: { euro_litro: number | null; fonte: "aziendale" | "mimit" | null; zona: string | null; euro_litro_lordo: number | null } | null;
  consumo: { tipo: TipoCarburante; dal: string; litri_100: number | null } | null;
  prezzi: Partial<Record<"gasolio" | "benzina", { dal: string; euro_litro: number }>>;
};
export type TotaliPercorrenze = {
  viaggi: number; tratte_senza_km: number; km_verificati: number; km_dichiarati: number; km_stimati: number;
  mimit?: boolean | null; litri: number | null; costo_carburante: number | null; costo_tariffa: number | null; km_senza_parametri: number | null;
};
export type QuadroPercorrenze = {
  totali: TotaliPercorrenze;
  mezzi: (TotaliPercorrenze & { mezzo_id: string; nome: string; targa: string | null })[];
};

export type GiroMezziSalvato = {
  id: string; mezzo_id: string; mezzo: string; autista: string; partenza: string; arrivo: string;
  commesse: string[]; oda: string[]; tratte: (TrattaViaggio & { oda: string[] })[];
  viaggio_id: string | null; stato_viaggio: Viaggio["stato"] | null; annullato_il: string | null;
};

/** Registro infortuni, quasi-incidenti e situazioni pericolose (migrazione 20290523110000). */
export type SicurezzaEvento = {
  id: string; company_id: string; order_id: string | null; segnalato_da: string;
  tipo: "infortunio" | "quasi_incidente" | "pericolo"; accaduto_il: string; luogo: string | null; descrizione: string;
  ferito: boolean; persona_coinvolta: string | null; parte_corpo: string | null;
  soccorso: "nessuno" | "primo_soccorso" | "pronto_soccorso" | "ambulanza"; testimoni: string | null; foto: string[];
  stato: "nuova" | "presa_in_carico" | "chiusa"; gestita_da: string | null; presa_in_carico_il: string | null;
  azioni_correttive: string | null; note_ufficio: string | null; chiusa_il: string | null; created_at: string; updated_at: string;
};

export type AppDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Views" | "Tables"> & {
    Functions: Database["public"]["Functions"] & {
      registra_dispositivo_push: { Args: { p_utente: string; p_chiave: string; p_token: string; p_piattaforma: "ios" | "android" }; Returns: undefined };
      disattiva_dispositivo_push: { Args: { p_utente: string; p_chiave: string }; Returns: undefined };
      campo_cantieri_tecnici: { Args: { p_azienda: string }; Returns: CantiereTecnico[] };
      campo_qr_cantiere_token: { Args: { p_ordine: string }; Returns: string | null };
      campo_mio_tesserino: { Args: Record<string, never>; Returns: string | null };
      tesserino_rigenera: { Args: { p_profilo: string }; Returns: string };
      campo_scheda_cantiere: { Args: { p_azienda: string; p_ordine: string; p_sezione: SezioneSchedaCantiere }; Returns: SchedaCantiere };
      commessa_accessi_tecnici: { Args: { p_ordine: string }; Returns: PersonaAccessoTecnico[] };
      commessa_accesso_tecnico: { Args: { p_ordine: string; p_persona: string; p_consentito: boolean }; Returns: undefined };
      mezzi_giro_contesto: {
        Args: { p_company: string; p_mezzo: string; p_cantiere: string; p_autista: string };
        Returns: { autisti: { id: string; label: string }[]; cantieri: { id: string; label: string; indirizzo: string | null }[] };
      };
      mezzi_giri_elenco: {
        Args: { p_company: string; p_order: string }; Returns: GiroMezziSalvato[];
      };
      mezzi_giro_salva: {
        Args: { p_company: string; p_id: string; p_mezzo: string; p_autista: string; p_partenza: string;
          p_arrivo: string; p_commesse: string[]; p_oda: string[]; p_luogo: string; p_rientro: boolean };
        Returns: string;
      };
      mezzi_giro_annulla: {
        Args: { p_company: string; p_giro: string }; Returns: undefined;
      };
      mezzi_giro_registra: {
        Args: { p_company: string; p_giro: string }; Returns: Viaggio;
      };
      carburante_mimit_giorno: {
        Args: { p_giorno: string }; Returns: PrezziMimit | null;
      };
      mezzo_carburante_riferimento_salva: {
        Args: { p_company: string; p_mezzo: string; p_dal: string; p_zona: string | null; p_preferisci_mimit: boolean };
        Returns: undefined;
      };
      mezzo_carburante_config: {
        Args: { p_company: string; p_mezzo: string; p_giorno: string };
        Returns: ConfigCarburanteMezzo;
      };
      mezzo_carburante_salva: {
        Args: { p_company: string; p_mezzo: string; p_dal: string; p_tipo: TipoCarburante; p_litri_100: number | null; p_euro_litro?: number | null };
        Returns: undefined;
      };
      mezzi_quadro_percorrenze: {
        Args: { p_company: string; p_ordine?: string; p_mezzo?: string; p_dal?: string; p_al?: string };
        Returns: QuadroPercorrenze;
      };
      mezzi_storico_percorsi: {
        Args: { p_company: string; p_mezzo: string; p_dal: string; p_al: string; p_offset?: number };
        Returns: StoricoPercorsiMezzo;
      };
      mappa_mezzi_giorno: {
        Args: { p_company: string; p_giorno: string; p_personale: boolean; p_dopo?: string };
        Returns: MezzoGiornoMappa[];
      };
      mappa_attrezzature_giorno: {
        Args: { p_company: string; p_giorno: string; p_personale: boolean; p_dopo?: string };
        Returns: AttrezzaturaGiornoMappa[];
      };
      mappa_storico_cantieri: {
        Args: { p_company: string; p_anno: number | null; p_personale: boolean; p_dopo?: string };
        Returns: {
          id: string; titolo: string; codice: string | null; indirizzo: string;
          lat: number | null; lng: number | null; data: string | null; chiusura_registrata: boolean;
        }[];
      };
      mappa_assegnati: {
        Args: { p_company: string; p_giorno: string; p_ordini: string[] };
        Returns: { order_id: string; user_id: string; nome: string | null; squadra_id: string | null; employee_id: string | null; mezzo_id: string | null; mezzo: string | null }[];
      };
      mappa_presenze: {
        Args: { p_company: string; p_giorno: string; p_ordini: string[]; p_personale: boolean };
        Returns: { order_id: string; user_id: string; nome: string | null; tipo: string; ora: string; fonte: string }[];
      };
      mappa_timbrature_gps: {
        Args: { p_company: string; p_giorno: string; p_personale: boolean };
        Returns: {
          id: string; order_id: string | null; persona_id: string | null; nome: string | null;
          tipo: string; ora: string; fonte: string; lat: number; lng: number; precisione: number | null;
          sede: string | null; esito: string | null;
        }[];
      };
      mappa_km_effettivi: {
        Args: { p_company: string; p_giorno: string; p_personale: boolean };
        Returns: { id: string; mezzo: string; metri: number; fonte: string; partenza: string; arrivo: string; aggiornato: string }[];
      };
      mappa_km_da_registrare: {
        Args: { p_company: string; p_giorno: string; p_personale: boolean };
        Returns: { id: string; mezzo_id: string; mezzo: string; partenza: string }[];
      };
      mappa_salva_posizione: {
        Args: { p_company: string; p_tipo: string; p_record: string; p_lat: number; p_lng: number; p_fonte: string; p_indirizzo: string };
        Returns: undefined;
      };
      mappa_consumo_mese: {
        Args: { p_company: string };
        Returns: { provider: string; voce: string; unita: number }[];
      };
      commessa_permesso_rilievi: { Args: { p_ordine: string; p_persona: string; p_consentito: boolean }; Returns: undefined };
      campo_avanzamenti_cantiere: {
        Args: { p_azienda: string; p_ordine: string; p_fase: string };
        Returns: AvanzamentoRegistratoCampo[];
      };
      campo_registra_avanzamento: {
        Args: {
          p_azienda: string; p_ordine: string; p_fase: string; p_sottofase: string | null;
          p_operazione: string; p_avanzamento: number | null; p_precedente: number | null; p_previsto: number | null;
          p_note: string | null; p_foto: string[];
        };
        Returns: string;
      };
      campo_rilievi_cantiere: { Args: { p_azienda: string; p_ordine: string }; Returns: VisitaRegistrataCampo[] };
      campo_registra_rilievo: {
        Args: { p_azienda: string; p_ordine: string; p_operazione: string; p_tipo: TipoVisitaCampo; p_giorno: string;
          p_misure: string | null; p_note: string | null };
        Returns: string;
      };
      campo_stato_invio_tecnico: {
        Args: { p_azienda: string; p_ordine: string; p_operazione: string; p_autore: string; p_tipo: "avanzamento" | "rilievo";
          p_fase: string | null; p_sottofase: string | null };
        Returns: boolean;
      };
      campo_invia_avanzamento: {
        Args: {
          p_azienda: string; p_ordine: string; p_fase: string; p_sottofase: string | null;
          p_operazione: string; p_autore: string; p_avanzamento: number | null; p_precedente: number | null; p_previsto: number | null;
          p_note: string | null; p_foto: string[];
        };
        Returns: string;
      };
      campo_registra_visita_con_foto: {
        Args: { p_azienda: string; p_ordine: string; p_operazione: string; p_autore: string; p_tipo: TipoVisitaCampo; p_giorno: string;
          p_misure: string | null; p_note: string | null; p_foto: string[] };
        Returns: string;
      };
      preventivo_riferimenti_storici: {
        Args: { p_azienda: string; p_codice: string | null; p_descrizione: string; p_tariffa: string | null; p_preventivo: string | null };
        Returns: Json;
      };
      prepara_commessa_computo_atomic: {
        Args: { p_azienda: string; p_computo: string; p_testata: Json; p_righe: Json };
        Returns: string;
      };
      prima_nota_riepilogo_filtrato: {
        Args: {
          p_company_id: string;
          p_from_date?: string;
          p_to_date?: string;
          p_direction?: string;
          p_category?: string;
          p_is_auto?: boolean;
          p_auto_source?: string;
          p_description_pattern?: string;
          p_bank_account_id?: string;
          p_conto_liquidita_id?: string;
          p_account_label_pattern?: string;
          p_monthly?: boolean;
        };
        Returns: { mese: string | null; entrate: number; uscite: number; saldo: number; entry_count: number }[];
      };
    };
    Tables: Omit<Database["public"]["Tables"], "staff_permissions" | "tasks" | "order_attachments" | "media_library_folders" | "quotes" | "mezzi_giornate"> & {
      mezzi_giornate: Omit<GiornataMezzo,"Row"> & { Row: GiornataMezzo["Row"] & { ore_lavorate: number | null; litri_riforniti: number | null; litri_consumati: number | null } };
      tasks: Tasks & { Row: Tasks["Row"] & { fish_call_id: string | null } };
      ai_fish_assistance: { Row: { [K in keyof FishAssistanceCase]: FishAssistanceCase[K] }; Insert: never; Update: never; Relationships: [] };
      sicurezza_eventi: {
        Row: SicurezzaEvento;
        Insert: Pick<SicurezzaEvento, "company_id" | "tipo" | "descrizione"> & Partial<Pick<SicurezzaEvento,
          "id" | "order_id" | "accaduto_il" | "luogo" | "ferito" | "persona_coinvolta" | "parte_corpo" | "soccorso" | "testimoni" | "foto">>;
        Update: Partial<Pick<SicurezzaEvento, "stato" | "azioni_correttive" | "note_ufficio">>;
        Relationships: [];
      };
      mappa_posizioni: {
        Row: { company_id: string; tipo: string; record_id: string; lat: number; lng: number; fonte: string; aggiornato_da: string; aggiornato_il: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      quotes: Omit<Quote, "Row" | "Insert" | "Update"> & {
        Row: Quote["Row"] & { ai_richiesta_id: string | null; ai_richiesta_salvata_il: string | null };
        Insert: Quote["Insert"] & { ai_richiesta_id?: string | null };
        Update: Quote["Update"] & { ai_richiesta_id?: string | null };
      };
      ai_attivita_live: {
        Row: AttivitaAi;
        Insert: AttivitaAi;
        Update: Partial<AttivitaAi>;
        Relationships: [];
      };
      media_library_folders: Omit<MediaFolder, "Row" | "Insert" | "Update"> & {
        Row: MediaFolder["Row"] & { mode: DriveFolderMode };
        Insert: MediaFolder["Insert"] & { mode?: DriveFolderMode };
        Update: MediaFolder["Update"] & { mode?: DriveFolderMode };
      };
      media_library_files: {
        Row: DriveFileRow;
        Insert: Omit<DriveFileRow, "created_at" | "created_by">;
        Update: Pick<DriveFileRow, "folder_id">;
        Relationships: [];
      };
      order_attachments: Omit<OrderAttachment, "Row" | "Insert" | "Update"> & {
        Row: OrderAttachment["Row"] & CantiereFields;
        Insert: OrderAttachment["Insert"] & Partial<CantiereFields>;
        Update: OrderAttachment["Update"] & Partial<CantiereFields>;
      };
      commessa_qr_cantiere: {
        Row: QrCantiereRow;
        Insert: Pick<QrCantiereRow, "order_id" | "documento_ids">;
        Update: Partial<Pick<QrCantiereRow, "documento_ids" | "revisione">>;
        Relationships: [];
      };
      staff_permissions: Omit<Staff, "Row" | "Insert" | "Update"> & {
        Row: Staff["Row"] & BankPermissions;
        Insert: Staff["Insert"] & Partial<BankPermissions>;
        Update: Staff["Update"] & Partial<BankPermissions>;
      };
    };
    Views: Database["public"]["Views"] & {
      bank_transactions_operativi: {
        Row: Database["public"]["Tables"]["bank_transactions"]["Row"];
        Relationships: Database["public"]["Tables"]["bank_transactions"]["Relationships"];
      };
      bank_accounts_operativi: {
        Row: Omit<Account["Row"], "opening_balance"> & { opening_balance: number | null };
        Relationships: Account["Relationships"];
      };
    };
  };
};
