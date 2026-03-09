import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface SupplierWithStats {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  vat_number: string | null;
  fiscal_code: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  country: string | null;
  website: string | null;
  payment_method: string | null;
  product_category: string | null;
  notes: string | null;
  is_foreign: boolean;
  vat_rate: number | null;
  lead_time_days: number;
  min_order_amount: number;
  credit_limit: number | null;
  rating: number | null;
  is_active: boolean;
  iban: string | null;
  bank_name: string | null;
  company_id: string;
  created_at: string;
  updated_at: string;
  // aggregated
  oda_count?: number;
  oda_total?: number;
  scadenze_aperte?: number;
  scadenze_importo?: number;
}

export function useOperationalSuppliers() {
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;

  const suppliersQuery = useQuery({
    queryKey: ["operational-suppliers", companyId],
    queryFn: async () => {
      const { data: suppliers, error } = await supabase
        .from("suppliers")
        .select("*")
        .eq("company_id", companyId!)
        .order("name");
      if (error) throw error;

      // Fetch aggregated OdA counts
      const { data: odaStats } = await supabase
        .from("purchase_orders")
        .select("supplier_id, total")
        .eq("company_id", companyId!)
        .neq("status", "annullato");

      // Fetch aggregated scadenze
      const { data: scadStats } = await supabase
        .from("scadenze")
        .select("supplier_id, amount, paid_amount, status")
        .eq("company_id", companyId!)
        .eq("tipo", "pagamento_fornitore")
        .in("status", ["da_pagare", "parziale"]);

      return (suppliers || []).map((s: any) => {
        const myOda = (odaStats || []).filter((o: any) => o.supplier_id === s.id);
        const myScad = (scadStats || []).filter((sc: any) => sc.supplier_id === s.id);
        return {
          ...s,
          oda_count: myOda.length,
          oda_total: myOda.reduce((sum: number, o: any) => sum + Number(o.total || 0), 0),
          scadenze_aperte: myScad.length,
          scadenze_importo: myScad.reduce((sum: number, sc: any) => sum + (Number(sc.amount) - Number(sc.paid_amount)), 0),
        } as SupplierWithStats;
      });
    },
    enabled: !!companyId,
  });

  const updateMutation = useMutation({
    mutationFn: async (params: { id: string; updates: Record<string, any> }) => {
      const { error } = await supabase
        .from("suppliers")
        .update(params.updates)
        .eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fornitore aggiornato");
      queryClient.invalidateQueries({ queryKey: ["operational-suppliers"] });
    },
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  return {
    suppliers: suppliersQuery.data || [],
    isLoading: suppliersQuery.isLoading,
    update: updateMutation,
  };
}

// Hook for supplier detail: OdA, Scadenze, Prima Nota
export function useSupplierDetail(supplierId: string | null) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const odaQuery = useQuery({
    queryKey: ["supplier-oda", supplierId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("*")
        .eq("company_id", companyId!)
        .eq("supplier_id", supplierId!)
        .order("issue_date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId && !!supplierId,
  });

  const scadenzeQuery = useQuery({
    queryKey: ["supplier-scadenze", supplierId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scadenze")
        .select("*")
        .eq("company_id", companyId!)
        .eq("supplier_id", supplierId!)
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId && !!supplierId,
  });

  const primaNotaQuery = useQuery({
    queryKey: ["supplier-prima-nota", supplierId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prima_nota_entries")
        .select("*")
        .eq("company_id", companyId!)
        .eq("supplier_id", supplierId!)
        .order("entry_date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId && !!supplierId,
  });

  return {
    oda: odaQuery.data || [],
    isOdaLoading: odaQuery.isLoading,
    scadenze: scadenzeQuery.data || [],
    isScadenzeLoading: scadenzeQuery.isLoading,
    primaNota: primaNotaQuery.data || [],
    isPrimaNotaLoading: primaNotaQuery.isLoading,
  };
}
