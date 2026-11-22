import type { FishAssistanceCase } from "../../../shared/fish/assistance";
import type { Database } from "./types";
import type { AttivitaAi } from "../../../shared/aiAttivita";
import type { CantiereTecnico, PersonaAccessoTecnico, SchedaCantiere, SezioneSchedaCantiere } from "@/lib/campo/schedaCantiere";
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
type Quote = Database["public"]["Tables"]["quotes"];
export type AppDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Views" | "Tables"> & {
    Functions: Database["public"]["Functions"] & {
      campo_cantieri_tecnici: { Args: { p_azienda: string }; Returns: CantiereTecnico[] };
      campo_scheda_cantiere: { Args: { p_azienda: string; p_ordine: string; p_sezione: SezioneSchedaCantiere }; Returns: SchedaCantiere };
      commessa_accessi_tecnici: { Args: { p_ordine: string }; Returns: PersonaAccessoTecnico[] };
      commessa_accesso_tecnico: { Args: { p_ordine: string; p_persona: string; p_consentito: boolean }; Returns: undefined };
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
    Tables: Omit<Database["public"]["Tables"], "staff_permissions" | "tasks" | "order_attachments" | "media_library_folders" | "quotes"> & {
      tasks: Tasks & { Row: Tasks["Row"] & { fish_call_id: string | null } };
      ai_fish_assistance: { Row: { [K in keyof FishAssistanceCase]: FishAssistanceCase[K] }; Insert: never; Update: never; Relationships: [] };
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
