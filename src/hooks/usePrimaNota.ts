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
  orders?: { order_code: string } | null;
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
  isAuto?: boolean | null; // true=auto only, false=manual only, null=all
  autoSource?: string;
}

export function usePrimaNota(filters: PrimaNotaFilters = {}, page: number = 1, pageSize: number = 50) {
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;

  const entriesQuery = useQuery({
    queryKey: [...queryKeys.primaNota.list(companyId, filters), page, pageSize],
    queryFn: async () => {
      let query = supabase
        .from("prima_nota_entries")
        .select(`*, suppliers(name), invoices(invoice_number), orders(order_code)`, { count: "exact" })
        .eq("company_id", companyId!);

      if (filters.fromDate) query = query.gte("entry_date", filters.fromDate);
      if (filters.toDate) query = query.lte("entry_date", filters.toDate);
      if (filters.direction) query = query.eq("direction", filters.direction);
      if (filters.category) query = query.eq("category", filters.category);
      if (filters.isAuto === true) query = query.eq("is_auto", true);
      if (filters.isAuto === false) query = query.eq("is_auto", false);
      if (filters.autoSource) query = query.eq("auto_source", filters.autoSource);
      if (filters.search?.trim()) query = query.ilike("description", `%${filters.search.trim()}%`);

      query = query
        .range((page - 1) * pageSize, page * pageSize - 1)
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false });

      const { data, error, count } = await query;
      if (error) throw error;
      return { data: data as unknown as PrimaNotaEntry[], totalCount: count ?? 0 };
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  const saldoQuery = useQuery({
    queryKey: queryKeys.primaNota.saldo(companyId, filters.fromDate, filters.toDate),
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
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
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
      queryClient.invalidateQueries({ queryKey: queryKeys.primaNota.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.summary(companyId) });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.primaNota.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.summary(companyId) });
    },
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  const totalCount = entriesQuery.data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return {
    entries: entriesQuery.data?.data || [],
    isLoading: entriesQuery.isLoading,
    totalCount,
    totalPages,
    saldo: saldoQuery.data,
    isSaldoLoading: saldoQuery.isLoading,
    create: createMutation,
    remove: deleteMutation,
  };
}
