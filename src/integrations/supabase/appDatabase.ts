import type { Database } from "./types";
/** Additive contract until the next full generated schema refresh. */
type Account = Database["public"]["Tables"]["bank_accounts"];
export type AppDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Views"> & {
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
