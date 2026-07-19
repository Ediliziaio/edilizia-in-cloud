import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

/**
 * Tesoreria MANUALE — per aziende che NON collegano la banca via Open Banking.
 * Gestisce conti/cassa creati a mano (bank_accounts.is_manual = true) e i loro
 * movimenti (bank_transactions.source in 'manuale'|'import_csv'|'import_ai').
 * Il saldo del conto è ricalcolato dal DB (opening_balance + somma movimenti),
 * così alimenta forecast, treasury e stato patrimoniale esattamente come i conti
 * bancari reali. NON tocca i conti Open Banking.
 */

export interface ManualAccount {
  id: string;
  display_name: string | null;
  account_name: string | null;
  iban: string | null;
  currency: string | null;
  opening_balance: number;
  current_balance: number;
  is_active: boolean;
}

export interface ManualTxInput {
  account_id: string;
  booking_date: string; // yyyy-MM-dd
  description: string;
  amount: number; // >0 entrata, <0 uscita
  category?: string | null;
  counterparty_name?: string | null;
  source?: "manuale" | "import_csv" | "import_ai";
  external_transaction_id?: string | null;
}

export function useManualTreasury() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const qc = useQueryClient();

  const accountsQuery = useQuery({
    queryKey: ["manual-treasury", "accounts", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_accounts")
        .select("id, display_name, account_name, iban, currency, opening_balance, current_balance, is_active")
        .eq("company_id", companyId!)
        .eq("is_manual", true)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as ManualAccount[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["manual-treasury"] });
    // I conti/movimenti manuali alimentano tesoreria, forecast e cruscotto.
    qc.invalidateQueries({ queryKey: ["cashflow"] });
    qc.invalidateQueries({ queryKey: ["treasury"] });
  };

  const createAccount = useMutation({
    mutationFn: async (params: { name: string; iban?: string; opening_balance: number; currency?: string }) => {
      const opening = Number(params.opening_balance) || 0;
      const { data, error } = await supabase
        .from("bank_accounts")
        .insert({
          company_id: companyId!,
          is_manual: true,
          connection_id: null,
          // external_account_id è NOT NULL + UNIQUE (company_id, external_account_id):
          // per i conti manuali (senza Open Banking) generiamo un id sintetico univoco.
          external_account_id: `manual:${crypto.randomUUID()}`,
          account_type: "checking",
          display_name: params.name,
          account_name: params.name,
          iban: params.iban?.trim() || null,
          currency: params.currency || "EUR",
          opening_balance: opening,
          current_balance: opening, // nessun movimento ancora
          is_active: true,
          balance_updated_at: new Date().toISOString(),
        } as never)
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { toast.success("Conto/cassa creato"); invalidate(); },
    onError: (e) => toast.error("Errore creazione conto", { description: String((e as Error).message) }),
  });

  const updateAccount = useMutation({
    mutationFn: async (params: { id: string; name?: string; iban?: string | null; opening_balance?: number; is_active?: boolean }) => {
      const patch: Record<string, unknown> = {};
      if (params.name !== undefined) { patch.display_name = params.name; patch.account_name = params.name; }
      if (params.iban !== undefined) patch.iban = params.iban?.trim() || null;
      if (params.is_active !== undefined) patch.is_active = params.is_active;
      if (params.opening_balance !== undefined) {
        const opening = Number(params.opening_balance) || 0;
        patch.opening_balance = opening;
        // ricalcola il saldo = apertura + somma movimenti
        const { data: sumRow } = await supabase
          .from("bank_transactions").select("amount").eq("account_id", params.id);
        const sum = (sumRow ?? []).reduce((s, r) => s + (Number((r as { amount: number }).amount) || 0), 0);
        patch.current_balance = opening + sum;
        patch.balance_updated_at = new Date().toISOString();
      }
      const { error } = await supabase.from("bank_accounts").update(patch as never).eq("id", params.id).eq("company_id", companyId!);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Conto aggiornato"); invalidate(); },
    onError: (e) => toast.error("Errore", { description: String((e as Error).message) }),
  });

  const upsertTx = useMutation({
    mutationFn: async (tx: ManualTxInput & { id?: string }) => {
      const amount = Number(tx.amount) || 0;
      const row = {
        company_id: companyId!,
        account_id: tx.account_id,
        booking_date: tx.booking_date,
        value_date: tx.booking_date,
        description: tx.description?.trim() || "Movimento",
        amount,
        currency: "EUR",
        transaction_type: amount >= 0 ? "credit" : "debit",
        status: "booked",
        category: tx.category?.trim() || null,
        counterparty_name: tx.counterparty_name?.trim() || null,
        source: tx.source || "manuale",
        // external_transaction_id è NOT NULL + UNIQUE (company_id, ...): per i
        // movimenti manuali senza id esterno ne generiamo uno sintetico univoco.
        external_transaction_id: tx.external_transaction_id ?? `manual:${crypto.randomUUID()}`,
      };
      if (tx.id) {
        const { error } = await supabase.from("bank_transactions").update(row as never).eq("id", tx.id).eq("company_id", companyId!);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("bank_transactions").insert(row as never);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Movimento salvato"); invalidate(); },
    onError: (e) => toast.error("Errore movimento", { description: String((e as Error).message) }),
  });

  const deleteTx = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bank_transactions").delete().eq("id", id).eq("company_id", companyId!);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Movimento eliminato"); invalidate(); },
    onError: (e) => toast.error("Errore", { description: String((e as Error).message) }),
  });

  /** Inserimento massivo (import CSV/Excel/AI) con dedup su external_transaction_id. */
  const bulkInsert = useMutation({
    mutationFn: async (params: { account_id: string; rows: ManualTxInput[]; source: "import_csv" | "import_ai" }) => {
      if (!params.rows.length) return { inserted: 0, skipped: 0 };
      // external_transaction_id ha UNIQUE (company_id, ...): l'id costruito lato
      // dialog (csv:/ai:) è unico solo dentro un file, non tra conti diversi.
      // Lo prefissiamo con l'account_id → unico per l'azienda e la dedup resta
      // per-conto (re-import dello stesso estratto sullo stesso conto = skip).
      const prefixed = params.rows.map((r) => ({
        ...r,
        external_transaction_id: r.external_transaction_id
          ? `${params.account_id}:${r.external_transaction_id}`.slice(0, 250)
          : `import:${crypto.randomUUID()}`,
      }));
      // dedup vs movimenti già presenti sul conto con lo stesso external_transaction_id
      const extIds = prefixed.map((r) => r.external_transaction_id);
      const existing = new Set<string>();
      for (let i = 0; i < extIds.length; i += 300) {
        const slice = extIds.slice(i, i + 300);
        const { data } = await supabase
          .from("bank_transactions")
          .select("external_transaction_id")
          .eq("account_id", params.account_id)
          .in("external_transaction_id", slice);
        (data ?? []).forEach((r) => { const v = (r as { external_transaction_id: string | null }).external_transaction_id; if (v) existing.add(v); });
      }
      const toInsert = prefixed.filter((r) => !existing.has(r.external_transaction_id));
      let inserted = 0;
      // batch da 500
      for (let i = 0; i < toInsert.length; i += 500) {
        const chunk = toInsert.slice(i, i + 500).map((tx) => {
          const amount = Number(tx.amount) || 0;
          return {
            company_id: companyId!, account_id: params.account_id,
            booking_date: tx.booking_date, value_date: tx.booking_date,
            description: tx.description?.trim() || "Movimento", amount, currency: "EUR",
            transaction_type: amount >= 0 ? "credit" : "debit", status: "booked",
            category: tx.category?.trim() || null, counterparty_name: tx.counterparty_name?.trim() || null,
            source: params.source, external_transaction_id: tx.external_transaction_id,
          };
        });
        const { error } = await supabase.from("bank_transactions").insert(chunk as never);
        if (error) throw error;
        inserted += chunk.length;
      }
      return { inserted, skipped: params.rows.length - toInsert.length };
    },
    onSuccess: (res) => { toast.success(`Import: ${res.inserted} movimenti aggiunti${res.skipped ? `, ${res.skipped} già presenti` : ""}`); invalidate(); },
    onError: (e) => toast.error("Errore import", { description: String((e as Error).message) }),
  });

  return {
    accounts: accountsQuery.data ?? [],
    isLoading: accountsQuery.isLoading,
    createAccount, updateAccount, upsertTx, deleteTx, bulkInsert,
  };
}
