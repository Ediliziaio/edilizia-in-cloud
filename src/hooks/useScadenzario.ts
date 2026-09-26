import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { queryKeys } from "@/lib/queryKeys";

export interface Scadenza {
  id: string;
  company_id: string;
  tipo: "incasso_cliente" | "pagamento_fornitore" | "costo_aziendale" | "scadenza_fiscale";
  direction: "entrata" | "uscita";
  description: string;
  amount: number;
  due_date: string;
  status: "da_pagare" | "pagata" | "parziale" | "annullata";
  paid_amount: number;
  paid_date: string | null;
  payment_method: string | null;
  invoice_id: string | null;
  order_id: string | null;
  supplier_id: string | null;
  cost_id: string | null;
  contact_id: string | null;
  order_item_id: string | null;
  prima_nota_entry_id: string | null;
  alert_days_before: number;
  alert_sent_at: string | null;
  is_auto_generated: boolean;
  auto_source: string | null;
  notes: string | null;
  is_recurring: boolean;
  created_at: string;
  updated_at: string;
  // joined
  suppliers?: { name: string } | null;
  invoices?: { invoice_number: string; client_company_name: string } | null;
  orders?: { order_code: string } | null;
  marketing_contacts?: { first_name: string; last_name: string; company_name: string | null } | null;
}

export interface ScadenzarioSummary {
  /** Scadute in totale: entrate + uscite sommate. Da sola non risponde a nulla — vedi i due campi sotto. */
  scadute_count: number;
  scadute_amount: number;
  /** Scadute che i clienti devono all'azienda. */
  scadute_entrata_count?: number;
  scadute_entrata_amount?: number;
  /** Scadute che l'azienda deve ai fornitori. */
  scadute_uscita_count?: number;
  scadute_uscita_amount?: number;
  questa_settimana_count: number;
  questa_settimana_amount: number;
  prossimi_30gg_count: number;
  prossimi_30gg_amount: number;
  questo_mese_count: number;
  questo_mese_amount: number;
  entrate_previste: number;
  uscite_previste: number;
  // Conteggi per-tab (year-scoped). Opzionali: la RPC li ha aggiunti in un secondo momento.
  tutte_count?: number;
  da_incassare_count?: number;
  da_pagare_count?: number;
  pagate_count?: number;
}

export interface ScadenzarioFilters {
  direction?: 'entrata' | 'uscita' | null;
  status?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  /** Testo cercato: filtra sulla descrizione LATO SERVER, cosi' la ricerca
   *  guarda tutte le scadenze e non solo quelle della pagina caricata. */
  search?: string | null;
  /** Solo le scadute: aperte (da pagare o parziali) con scadenza passata. Prima
   *  la linguetta «Scadute» non passava nessun filtro e mostrava tutte. */
  soloScadute?: boolean;
  /** Tipo di scadenza (incasso_cliente, pagamento_fornitore…): il filtro
   *  «Tipo» della pagina esisteva ma non arrivava alla query. */
  tipo?: string | null;
}

export function useScadenzario(page: number = 1, pageSize: number = 50, filters: ScadenzarioFilters = {}) {
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;

  const { direction, status, dateFrom, dateTo, search, soloScadute, tipo } = filters;

  const scadenzeQuery = useQuery({
    queryKey: [...queryKeys.scadenzario.list(companyId), page, pageSize, direction, status, dateFrom, dateTo, search, soloScadute ?? false, tipo ?? null],
    queryFn: async () => {
      let query = supabase
        .from("scadenze")
        .select(`
          *,
          suppliers(name),
          invoices(invoice_number, client_company_name),
          orders(order_code),
          marketing_contacts(first_name, last_name, company_name)
        `, { count: "exact" })
        .eq("company_id", companyId!)
        .order("due_date", { ascending: true });

      // La descrizione delle scadenze automatiche porta numero fattura e
      // nominativo ("FT-2026-0026 — Mario Rossi"), quindi copre quasi tutto.
      if (search && search.trim()) query = query.ilike("description", `%${search.trim()}%`);
      if (direction) query = query.eq("direction", direction);
      if (status) query = query.eq("status", status);
      if (dateFrom) query = query.gte("due_date", dateFrom);
      if (dateTo) query = query.lte("due_date", dateTo);
      if (soloScadute) {
        query = query
          .in("status", ["da_pagare", "parziale"])
          .lt("due_date", new Date().toLocaleDateString("en-CA"));
      }
      if (tipo) query = query.eq("tipo", tipo);

      const { data, error, count } = await query
        .range((page - 1) * pageSize, page * pageSize - 1);

      if (error) throw error;
      return { data: data as unknown as Scadenza[], totalCount: count ?? 0 };
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  const summaryQuery = useQuery({
    queryKey: [...queryKeys.scadenzario.summary(companyId), dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_scadenzario_summary", {
        p_company_id: companyId!,
        p_date_from: dateFrom ?? null,
        p_date_to: dateTo ?? null,
      });
      if (error) throw error;
      return data as unknown as ScadenzarioSummary;
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  const markPaidMutation = useMutation({
    mutationFn: async (params: {
      scadenzaId: string;
      amount: number;
      paymentMethod?: string;
      paymentDate?: string;
      notes?: string;
      accountLabel?: string;
    }) => {
      const { data, error } = await supabase.rpc("mark_scadenza_paid", {
        p_scadenza_id: params.scadenzaId,
        p_amount: params.amount,
        p_payment_method: params.paymentMethod || "bonifico",
        p_payment_date: params.paymentDate || new Date().toLocaleDateString("en-CA"),
        p_notes: params.notes || null,
        p_account_label: params.accountLabel || "banca",
      });
      if (error) throw error;
      const result = data as Record<string, unknown> | null;
      if (result?.error) throw new Error(String(result.error));
      return result;
    },
    onSuccess: () => {
      toast.success("Pagamento registrato");
      queryClient.invalidateQueries({ queryKey: queryKeys.scadenzario.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.primaNota.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.scadenze(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.summary(companyId) });
    },
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  const createMutation = useMutation({
    mutationFn: async (params: {
      tipo: string;
      description: string;
      amount: number;
      due_date: string;
      supplier_id?: string | null;
      contact_id?: string | null;
      invoice_id?: string | null;
      order_id?: string | null;
      cost_id?: string | null;
      notes?: string;
      payment_method?: string;
      alert_days_before?: number;
    }) => {
      const { error } = await supabase.from("scadenze").insert({
        company_id: companyId!,
        tipo: params.tipo,
        description: params.description,
        amount: params.amount,
        due_date: params.due_date,
        supplier_id: params.supplier_id || null,
        contact_id: params.contact_id || null,
        invoice_id: params.invoice_id || null,
        order_id: params.order_id || null,
        cost_id: params.cost_id || null,
        notes: params.notes || null,
        payment_method: params.payment_method || null,
        alert_days_before: params.alert_days_before ?? 7,
        created_by: (await supabase.auth.getUser()).data.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Scadenza creata");
      queryClient.invalidateQueries({ queryKey: queryKeys.scadenzario.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.scadenze(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.summary(companyId) });
    },
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("scadenze")
        .update({ status: "annullata" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Scadenza annullata");
      queryClient.invalidateQueries({ queryKey: queryKeys.scadenzario.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.scadenze(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.summary(companyId) });
    },
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  const totalCount = scadenzeQuery.data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return {
    scadenze: scadenzeQuery.data?.data || [],
    isLoading: scadenzeQuery.isLoading,
    totalCount,
    totalPages,
    summary: summaryQuery.data,
    isSummaryLoading: summaryQuery.isLoading,
    markPaid: markPaidMutation,
    create: createMutation,
    cancel: cancelMutation,
  };
}
