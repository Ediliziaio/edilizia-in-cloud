import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { queryKeys } from "@/lib/queryKeys";

export interface PrimaNotaEntry {
  id: string;
  company_id: string;
  direction: "entrata" | "uscita";
  category: string;
  description: string;
  amount: number;
  entry_date: string;
  payment_method: string | null;
  reference_number: string | null;
  invoice_id: string | null;
  order_id: string | null;
  supplier_id: string | null;
  cost_id: string | null;
  scadenza_id: string | null;
  order_item_id: string | null;
  account_label: string | null;
  is_auto: boolean;
  auto_source: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  notes: string | null;
  created_at: string;
  // joined
  suppliers?: { name: string } | null;
  invoices?: { invoice_number: string } | null;
  orders?: { order_number: string } | null;
}

export interface PrimaNotaSaldo {
  entrate: number;
  uscite: number;
  saldo: number;
  entry_count: number;
}

export interface PrimaNotaFilters {
  fromDate?: string;
  toDate?: string;
  direction?: "entrata" | "uscita" | "";
  category?: string;
  search?: string;
}

export function usePrimaNota(filters: PrimaNotaFilters = {}) {
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;

  const entriesQuery = useQuery({
    queryKey: ["prima-nota", companyId, filters],
    queryFn: async () => {
      let query = supabase
        .from("prima_nota_entries")
        .select(`*, suppliers(name), invoices(invoice_number), orders(order_number)`)
        .eq("company_id", companyId!)
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(10000);

      if (filters.fromDate) query = query.gte("entry_date", filters.fromDate);
      if (filters.toDate) query = query.lte("entry_date", filters.toDate);
      if (filters.direction) query = query.eq("direction", filters.direction);
      if (filters.category) query = query.eq("category", filters.category);

      const { data, error } = await query;
      if (error) throw error;

      let results = data as unknown as PrimaNotaEntry[];
      if (filters.search?.trim()) {
        const q = filters.search.toLowerCase();
        results = results.filter(
          (e) =>
            e.description.toLowerCase().includes(q) ||
            e.reference_number?.toLowerCase().includes(q) ||
            e.suppliers?.name?.toLowerCase().includes(q)
        );
      }
      return results;
    },
    enabled: !!companyId,
  });

  const saldoQuery = useQuery({
    queryKey: ["prima-nota-saldo", companyId, filters.fromDate, filters.toDate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_prima_nota_saldo", {
        p_company_id: companyId!,
        p_from_date: filters.fromDate || undefined,
        p_to_date: filters.toDate || undefined,
      });
      if (error) throw error;
      return data as unknown as PrimaNotaSaldo;
    },
    enabled: !!companyId,
  });

  const createMutation = useMutation({
    mutationFn: async (params: {
      direction: "entrata" | "uscita";
      category: string;
      description: string;
      amount: number;
      entry_date: string;
      payment_method?: string;
      reference_number?: string;
      supplier_id?: string | null;
      account_label?: string;
      notes?: string;
    }) => {
      const { error } = await supabase.from("prima_nota_entries").insert({
        company_id: companyId!,
        direction: params.direction,
        category: params.category,
        description: params.description,
        amount: params.amount,
        entry_date: params.entry_date,
        payment_method: params.payment_method || null,
        reference_number: params.reference_number || null,
        supplier_id: params.supplier_id || null,
        account_label: params.account_label || "banca",
        notes: params.notes || null,
        is_auto: false,
        created_by: (await supabase.auth.getUser()).data.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Registrazione creata");
      queryClient.invalidateQueries({ queryKey: ["prima-nota"] });
      queryClient.invalidateQueries({ queryKey: ["prima-nota-saldo"] });
    },
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("prima_nota_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Registrazione eliminata");
      queryClient.invalidateQueries({ queryKey: ["prima-nota"] });
      queryClient.invalidateQueries({ queryKey: ["prima-nota-saldo"] });
    },
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  return {
    entries: entriesQuery.data || [],
    isLoading: entriesQuery.isLoading,
    saldo: saldoQuery.data,
    isSaldoLoading: saldoQuery.isLoading,
    create: createMutation,
    remove: deleteMutation,
  };
}
