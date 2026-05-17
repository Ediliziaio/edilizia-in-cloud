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

type SupplierBaseRow = Omit<SupplierWithStats, "oda_count" | "oda_total" | "scadenze_aperte" | "scadenze_importo">;

interface SupplierOdaSummary {
  supplier_id: string | null;
  total: number | string | null;
}

interface SupplierScadenzaSummary {
  supplier_id: string | null;
  amount: number | string | null;
  paid_amount: number | string | null;
}

export function useOperationalSuppliers() {
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;

  const suppliersQuery = useQuery({
    queryKey: ["operational-suppliers", companyId],
    queryFn: async () => {
      // Run all three queries in parallel
      const [suppliersRes, odaRes, scadRes] = await Promise.all([
        supabase
          .from("suppliers")
          .select("id, name, email, phone, vat_number, fiscal_code, address, city, province, postal_code, country, website, payment_method, product_category, notes, is_foreign, vat_rate, lead_time_days, min_order_amount, credit_limit, rating, is_active, iban, bank_name, company_id, created_at, updated_at")
          .eq("company_id", companyId!)
          .order("name"),
        supabase
          .from("purchase_orders")
          .select("supplier_id, total")
          .eq("company_id", companyId!)
          .neq("status", "annullato"),
        supabase
          .from("scadenze")
          .select("supplier_id, amount, paid_amount, status")
          .eq("company_id", companyId!)
          .eq("tipo", "pagamento_fornitore")
          .in("status", ["da_pagare", "parziale"]),
      ]);

      if (suppliersRes.error) throw suppliersRes.error;
      if (odaRes.error) throw odaRes.error;
      if (scadRes.error) throw scadRes.error;
      const suppliers = (suppliersRes.data ?? []) as SupplierBaseRow[];
      const odaStats = (odaRes.data ?? []) as SupplierOdaSummary[];
      const scadStats = (scadRes.data ?? []) as SupplierScadenzaSummary[];

      return suppliers.map((s) => {
        const myOda = odaStats.filter((o) => o.supplier_id === s.id);
        const myScad = scadStats.filter((sc) => sc.supplier_id === s.id);
        return {
          ...s,
          oda_count: myOda.length,
          oda_total: myOda.reduce((sum, o) => sum + Number(o.total || 0), 0),
          scadenze_aperte: myScad.length,
          scadenze_importo: myScad.reduce((sum, sc) => sum + (Number(sc.amount) - Number(sc.paid_amount)), 0),
        } as SupplierWithStats;
      });
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  const updateMutation = useMutation({
    mutationFn: async (params: { id: string; updates: Record<string, unknown> }) => {
      if (!companyId) throw new Error("Azienda non selezionata");
      const { error } = await supabase
        .from("suppliers")
        .update(params.updates)
        .eq("id", params.id)
        .eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fornitore aggiornato");
      queryClient.invalidateQueries({ queryKey: ["operational-suppliers"] });
    },
    onError: (e) => toast.error("Errore", {
      description: e instanceof Error ? e.message : "Errore sconosciuto",
    }),
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
    queryKey: ["supplier-oda", companyId, supplierId],
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
    queryKey: ["supplier-scadenze", companyId, supplierId],
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
    queryKey: ["supplier-prima-nota", companyId, supplierId],
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
