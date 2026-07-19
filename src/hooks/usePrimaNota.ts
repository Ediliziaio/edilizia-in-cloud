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
  /** Fattura/NC nativa che ha generato la registrazione (incasso fattura) */
  documenti_fiscali?: { id: string; numero: string | null; tipo: string } | null;
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

  // Un unico posto per i filtri → lista, saldo ed export restano allineati.
  // (Prima il saldo ignorava direzione/categoria/ricerca e l'export prendeva
  //  solo la pagina corrente: due incoerenze sui numeri, ora rimosse.)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyFilters = (q: any) => {
    if (filters.fromDate) q = q.gte("entry_date", filters.fromDate);
    if (filters.toDate) q = q.lte("entry_date", filters.toDate);
    if (filters.direction) q = q.eq("direction", filters.direction);
    if (filters.category) q = q.eq("category", filters.category);
    if (filters.isAuto === true) q = q.eq("is_auto", true);
    if (filters.isAuto === false) q = q.eq("is_auto", false);
    if (filters.autoSource) q = q.eq("auto_source", filters.autoSource);
    if (filters.search?.trim()) q = q.ilike("description", `%${filters.search.trim()}%`);
    return q;
  };

  const entriesQuery = useQuery({
    queryKey: [...queryKeys.primaNota.list(companyId, filters), page, pageSize],
    queryFn: async () => {
      let query = applyFilters(
        supabase
          .from("prima_nota_entries")
          .select(`*, suppliers(name), invoices(invoice_number), orders(order_code), documenti_fiscali(id, numero, tipo)`, { count: "exact" })
          .eq("company_id", companyId!)
      );

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

  // Il saldo deve rispecchiare la lista filtrata. Con soli filtri di data usiamo
  // la RPC server-side (SUM completa, nessun cap). Con filtri extra (direzione/
  // categoria/ricerca/auto) aggreghiamo lato client sulle righe filtrate, così i
  // KPI combaciano con ciò che l'utente vede (prima mostravano l'intero periodo).
  const hasNonDateFilter = !!(
    filters.direction || filters.category || filters.search?.trim() ||
    filters.isAuto != null || filters.autoSource
  );

  const saldoQuery = useQuery({
    queryKey: [
      ...queryKeys.primaNota.saldo(companyId, filters.fromDate, filters.toDate),
      filters.direction ?? "", filters.category ?? "", filters.search?.trim() ?? "",
      filters.isAuto ?? "", filters.autoSource ?? "",
    ],
    queryFn: async () => {
      if (!hasNonDateFilter) {
        const { data, error } = await supabase.rpc("get_prima_nota_saldo", {
          p_company_id: companyId!,
          p_from_date: filters.fromDate || undefined,
          p_to_date: filters.toDate || undefined,
        });
        if (error) throw error;
        return data as unknown as PrimaNotaSaldo;
      }
      const { data, error } = await applyFilters(
        supabase.from("prima_nota_entries").select("amount, direction").eq("company_id", companyId!)
      ).limit(50000);
      if (error) throw error;
      let entrate = 0, uscite = 0;
      for (const r of ((data as { amount: number | null; direction: string }[]) ?? [])) {
        const amt = Number(r.amount) || 0;
        if (r.direction === "entrata") entrate += amt; else uscite += amt;
      }
      const round2 = (n: number) => Math.round(n * 100) / 100;
      return { entrate: round2(entrate), uscite: round2(uscite), saldo: round2(entrate - uscite), entry_count: data?.length ?? 0 };
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Grafico "ultimi 6 mesi": aggregazione mensile su TUTTE le registrazioni degli
  // ultimi 6 mesi, indipendente da paginazione e dai filtri di lista. Prima il
  // grafico leggeva la lista paginata/filtrata (default = solo mese corrente, 50
  // righe) → mostrava un solo mese.
  const monthlyChartQuery = useQuery({
    queryKey: ["primaNota", "chart6m", companyId],
    queryFn: async () => {
      const since = new Date();
      since.setDate(1);
      since.setMonth(since.getMonth() - 5);
      const sinceStr = since.toLocaleDateString("en-CA"); // yyyy-MM-dd, locale
      const { data, error } = await supabase
        .from("prima_nota_entries")
        .select("amount, direction, entry_date")
        .eq("company_id", companyId!)
        .gte("entry_date", sinceStr)
        .limit(50000);
      if (error) throw error;
      const buckets: Record<string, { entrate: number; uscite: number }> = {};
      for (const r of ((data as { amount: number | null; direction: string; entry_date: string }[]) ?? [])) {
        const key = r.entry_date.slice(0, 7); // "yyyy-MM"
        const b = (buckets[key] ??= { entrate: 0, uscite: 0 });
        const amt = Number(r.amount) || 0;
        if (r.direction === "entrata") b.entrate += amt; else b.uscite += amt;
      }
      return buckets;
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  /** Tutte le righe filtrate (senza paginazione) per l'export CSV completo. */
  const fetchAllForExport = async (): Promise<PrimaNotaEntry[]> => {
    if (!companyId) return [];
    const { data, error } = await applyFilters(
      supabase
        .from("prima_nota_entries")
        .select(`*, suppliers(name), invoices(invoice_number), orders(order_code), documenti_fiscali(id, numero, tipo)`)
        .eq("company_id", companyId)
    ).order("entry_date", { ascending: false }).order("created_at", { ascending: false }).limit(50000);
    if (error) throw error;
    return (data as unknown as PrimaNotaEntry[]) ?? [];
  };

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
      order_id?: string | null;
      account_label?: string;
      attachment_url?: string;
      attachment_name?: string;
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
        order_id: params.order_id || null,
        account_label: params.account_label || "banca",
        attachment_url: params.attachment_url || null,
        attachment_name: params.attachment_name || null,
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
    monthlyChart: monthlyChartQuery.data,
    create: createMutation,
    remove: deleteMutation,
    fetchAllForExport,
  };
}
