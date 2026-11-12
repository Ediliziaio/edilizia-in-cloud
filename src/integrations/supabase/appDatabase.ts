import type { Database } from "./types";
/** Additive contract until the next full generated schema refresh. */
type Staff = Database["public"]["Tables"]["staff_permissions"];
type BankPermissions = { can_view_bank_balances: boolean; can_reconcile_bank_transactions: boolean };
type Account = Database["public"]["Tables"]["bank_accounts"];
export type AppDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Views" | "Tables"> & {
    Tables: Omit<Database["public"]["Tables"], "staff_permissions"> & {
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
