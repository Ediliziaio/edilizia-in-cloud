import type { Database } from "./types";
/** Additive contract until the next full generated schema refresh. */
type Staff = Database["public"]["Tables"]["staff_permissions"];
type BankPermissions = { can_view_bank_balances: boolean; can_reconcile_bank_transactions: boolean };
type OrderAttachment = Database["public"]["Tables"]["order_attachments"];
type CantiereFields = { cantiere_tipo: string | null };
type QrCantiereRow = { order_id: string; token: string; documento_ids: string[]; revisione: string };
type MediaFolder = Database["public"]["Tables"]["media_library_folders"];
export type DriveFolderMode = "automatic" | "manual";
export type DriveFileRow = { id: string; company_id: string; folder_id: string | null; name: string; mime_type: string; size_bytes: number; storage_path: string; shared: boolean; created_by: string | null; created_at: string };
type Account = Database["public"]["Tables"]["bank_accounts"];
export type AppDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Views" | "Tables"> & {
    Functions: Database["public"]["Functions"] & {
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
    Tables: Omit<Database["public"]["Tables"], "staff_permissions" | "order_attachments" | "media_library_folders"> & {
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
