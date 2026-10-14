import { loadCatalogPages } from "@/lib/listino/loadCatalogPages";
import { invalidaFornitori } from "@/lib/suppliers/cacheFornitori";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { userErrorMessage } from "@/lib/userErrorMessage";
import type { Database } from "@/integrations/supabase/types";

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
  contact_name?: string | null;
  contact_role?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  uses_gs1?: boolean | null;
  // aggregated
  oda_count?: number;
  oda_total?: number;
  scadenze_aperte?: number;
  scadenze_importo?: number;
}

type SupplierBaseRow = Omit<
  SupplierWithStats,
  "oda_count" | "oda_total" | "scadenze_aperte" | "scadenze_importo"
>;

interface SupplierOdaSummary {
  id: string;
  supplier_id: string | null;
  total: number | string | null;
}

interface SupplierScadenzaSummary {
  id: string;
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
      const [suppliers, odaStats, scadStats] = await Promise.all([
        loadCatalogPages<SupplierBaseRow>((from, to) =>
          supabase
            .from("suppliers")
            .select("*")
            .eq("company_id", companyId!)
            .order("name")
            .order("id")
            .range(from, to),
        ),
        loadCatalogPages<SupplierOdaSummary>((from, to) =>
          supabase
            .from("purchase_orders")
            .select("id, supplier_id, total")
            .eq("company_id", companyId!)
            .neq("status", "annullato")
            .order("id")
            .range(from, to),
        ),
        loadCatalogPages<SupplierScadenzaSummary>((from, to) =>
          supabase
            .from("scadenze")
            .select("id, supplier_id, amount, paid_amount, status")
            .eq("company_id", companyId!)
            .eq("tipo", "pagamento_fornitore")
            .in("status", ["da_pagare", "parziale"])
            .order("id")
            .range(from, to),
        ),
      ]);

      return suppliers.map((s) => {
        const myOda = odaStats.filter((o) => o.supplier_id === s.id);
        const myScad = scadStats.filter((sc) => sc.supplier_id === s.id);
        return {
          ...s,
          oda_count: myOda.length,
          oda_total: myOda.reduce((sum, o) => sum + Number(o.total || 0), 0),
          scadenze_aperte: myScad.length,
          scadenze_importo: myScad.reduce(
            (sum, sc) => sum + (Number(sc.amount) - Number(sc.paid_amount)),
            0,
          ),
        } as SupplierWithStats;
      });
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  const updateMutation = useMutation({
    mutationFn: async (params: {
      id: string;
      updates: Database["public"]["Tables"]["suppliers"]["Update"];
    }) => {
      if (!companyId) throw new Error("Azienda non selezionata");
      const { error } = await supabase
        .from("suppliers")
        .update(params.updates)
        .eq("id", params.id)
        .eq("company_id", companyId)
        .select("id")
        .single();
      if (error) throw error;
    },
    onSuccess: async () => {
      await invalidaFornitori(queryClient);
      toast.success("Fornitore aggiornato");
    },
    // Mai il testo del database in un toast: la modifica rapida dice in italiano cosa è andato storto.
    onError: (e) =>
      toast.error("Fornitore non aggiornato", {
        description: userErrorMessage(
          e,
          "Non sono riuscito a salvare il fornitore. Riprova tra poco.",
        ),
      }),
  });

  return {
    suppliers: suppliersQuery.data || [],
    isLoading: suppliersQuery.isLoading,
    isError: suppliersQuery.isError,
    refetch: suppliersQuery.refetch,
    update: updateMutation,
  };
}

// Hook for supplier detail: OdA, Scadenze, Prima Nota
export function useSupplierDetail(supplierId: string | null) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const odaQuery = useQuery({
    queryKey: ["supplier-oda", companyId, supplierId],
    queryFn: async () =>
      loadCatalogPages<Database["public"]["Tables"]["purchase_orders"]["Row"]>(
        (from, to) =>
          supabase
            .from("purchase_orders")
            .select("*")
            .eq("company_id", companyId!)
            .eq("supplier_id", supplierId!)
            .order("issue_date", { ascending: false })
            .order("id")
            .range(from, to),
      ),
    enabled: !!companyId && !!supplierId,
  });

  const scadenzeQuery = useQuery({
    queryKey: ["supplier-scadenze", companyId, supplierId],
    queryFn: async () =>
      loadCatalogPages<Database["public"]["Tables"]["scadenze"]["Row"]>(
        (from, to) =>
          supabase
            .from("scadenze")
            .select("*")
            .eq("company_id", companyId!)
            .eq("supplier_id", supplierId!)
            .order("due_date", { ascending: true })
            .order("id")
            .range(from, to),
      ),
    enabled: !!companyId && !!supplierId,
  });

  const primaNotaQuery = useQuery({
    queryKey: ["supplier-prima-nota", companyId, supplierId],
    queryFn: async () =>
      loadCatalogPages<
        Database["public"]["Tables"]["prima_nota_entries"]["Row"]
      >((from, to) =>
        supabase
          .from("prima_nota_entries")
          .select("*")
          .eq("company_id", companyId!)
          .eq("supplier_id", supplierId!)
          .order("entry_date", { ascending: false })
          .order("id")
          .range(from, to),
      ),
    enabled: !!companyId && !!supplierId,
  });

  return {
    oda: odaQuery.data || [],
    isOdaLoading: odaQuery.isLoading,
    isOdaError: odaQuery.isError,
    scadenze: scadenzeQuery.data || [],
    isScadenzeLoading: scadenzeQuery.isLoading,
    isScadenzeError: scadenzeQuery.isError,
    primaNota: primaNotaQuery.data || [],
    isPrimaNotaLoading: primaNotaQuery.isLoading,
    isPrimaNotaError: primaNotaQuery.isError,
    refetch: () =>
      Promise.all([
        odaQuery.refetch(),
        scadenzeQuery.refetch(),
        primaNotaQuery.refetch(),
      ]),
  };
}
