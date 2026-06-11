/**
 * useCompanyBase — coordinate della sede operativa dell'azienda corrente.
 *
 * Legge companies.operational_lat/lng (valorizzate dal geocoding dell'indirizzo
 * operativo in Impostazioni). Restituisce null finché non sono disponibili o
 * se l'azienda non ha mai geocodificato la sede — i chiamanti devono gestire
 * il fallback (es. default Milano per i travel legs legacy).
 */
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export interface CompanyBase {
  lat: number;
  lng: number;
}

export function useCompanyBase(): CompanyBase | null {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const { data } = useQuery({
    queryKey: ["company-base-coords", companyId],
    queryFn: async (): Promise<CompanyBase | null> => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from("companies")
        .select("operational_lat, operational_lng")
        .eq("id", companyId)
        .maybeSingle();
      if (error || !data) return null;
      if (data.operational_lat == null || data.operational_lng == null) return null;
      return { lat: Number(data.operational_lat), lng: Number(data.operational_lng) };
    },
    enabled: !!companyId,
    staleTime: 30 * 60 * 1000, // la sede non cambia spesso
  });

  return data ?? null;
}
