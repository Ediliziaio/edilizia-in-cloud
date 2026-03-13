import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";

export interface Venditore {
  id: string;
  company_id: string;
  user_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  commission_type: string;
  commission_value: number;
  is_active: boolean;
  area_geografica: string | null;
  zona: string | null;
  data_inizio: string | null;
  avatar_url: string | null;
}

export interface PerformanceBaseVenditore {
  salesperson_id: string;
  company_id: string;
  nome_completo: string;
  area_geografica: string | null;
  is_active: boolean;
  preventivi_anno: number;
  preventivi_vinti_anno: number;
  win_rate_anno: number | null;
  fatturato_anno: number;
  valore_medio_ordine: number | null;
  clienti_attivi_anno: number;
  pipeline_valore: number;
  pipeline_count: number;
}

export function useVenditori() {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["venditori", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salespeople")
        .select("*")
        .eq("company_id", companyId!)
        .eq("is_active", true)
        .order("last_name");
      if (error) throw error;
      return data as Venditore[];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });
}

export function usePerformanceBaseVenditori() {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["performance-base-venditori", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("performance_base_venditori" as any)
        .select("*")
        .eq("company_id", companyId!);
      if (error) throw error;
      return data as PerformanceBaseVenditore[];
    },
    enabled: !!companyId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useVenditore(salespersonId: string | null) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["venditore", salespersonId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salespeople")
        .select("*")
        .eq("id", salespersonId!)
        .eq("company_id", companyId!)
        .single();
      if (error) throw error;
      return data as Venditore;
    },
    enabled: !!salespersonId && !!companyId,
  });
}
