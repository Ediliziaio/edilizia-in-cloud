import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

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
  orders?: { order_number: string } | null;
  marketing_contacts?: { first_name: string; last_name: string; company_name: string | null } | null;
}

export interface ScadenzarioSummary {
  scadute_count: number;
  scadute_amount: number;
  questa_settimana_count: number;
  questa_settimana_amount: number;
  prossimi_30gg_count: number;
  prossimi_30gg_amount: number;
  questo_mese_count: number;
  questo_mese_amount: number;
  entrate_previste: number;
  uscite_previste: number;
}

export function useScadenzario() {
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;

  const scadenzeQuery = useQuery({
    queryKey: ["scadenze", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scadenze")
        .select(`
          *,
          suppliers(name),
          invoices(invoice_number, client_company_name),
          orders(order_number),
          marketing_contacts(first_name, last_name, company_name)
        `)
        .eq("company_id", companyId!)
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data as unknown as Scadenza[];
    },
    enabled: !!companyId,
  });

  const summaryQuery = useQuery({
    queryKey: ["scadenzario-summary", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_scadenzario_summary", {
        p_company_id: companyId!,
      });
      if (error) throw error;
      return data as unknown as ScadenzarioSummary;
    },
    enabled: !!companyId,
  });

  const markPaidMutation = useMutation({
    mutationFn: async (params: {
      scadenzaId: string;
      amount: number;
      paymentMethod?: string;
      paymentDate?: string;
      notes?: string;
    }) => {
      const { data, error } = await supabase.rpc("mark_scadenza_paid", {
        p_scadenza_id: params.scadenzaId,
        p_amount: params.amount,
        p_payment_method: params.paymentMethod || "bonifico",
        p_payment_date: params.paymentDate || new Date().toISOString().split("T")[0],
        p_notes: params.notes || null,
      });
      if (error) throw error;
      const result = data as any;
      if (result?.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      toast.success("Pagamento registrato");
      queryClient.invalidateQueries({ queryKey: ["scadenze"] });
      queryClient.invalidateQueries({ queryKey: ["scadenzario-summary"] });
      queryClient.invalidateQueries({ queryKey: ["prima-nota"] });
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
        created_by: (await supabase.auth.getUser()).data.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Scadenza creata");
      queryClient.invalidateQueries({ queryKey: ["scadenze"] });
      queryClient.invalidateQueries({ queryKey: ["scadenzario-summary"] });
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
      queryClient.invalidateQueries({ queryKey: ["scadenze"] });
      queryClient.invalidateQueries({ queryKey: ["scadenzario-summary"] });
    },
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  return {
    scadenze: scadenzeQuery.data || [],
    isLoading: scadenzeQuery.isLoading,
    summary: summaryQuery.data,
    isSummaryLoading: summaryQuery.isLoading,
    markPaid: markPaidMutation,
    create: createMutation,
    cancel: cancelMutation,
  };
}
