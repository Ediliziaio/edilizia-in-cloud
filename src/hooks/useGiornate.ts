import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import type { HrGiornata } from "@/types/hr";

export interface GiornataWithProfilo extends HrGiornata {
  profilo_nome: string;
  profilo_cognome: string;
  profilo_colore: string;
  profilo_mansione: string | null;
  profilo_reparto: string | null;
}

export function useGiornate(dateFrom: string, dateTo: string) {
  const companyId = useEffectiveCompanyId();

  return useQuery({
    queryKey: ["hr-giornate", companyId, dateFrom, dateTo],
    queryFn: async ({ signal }) => {
      if (!companyId) return [];
      const giornate: GiornataWithProfilo[] = [];
      // Un mese può superare le 1000 giornate (persone × giorni): leggere
      // soltanto il primo blocco produceva riepiloghi silenziosamente parziali.
      const pageSize = 500;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from("hr_giornate")
          .select(
            "*, hr_profili!hr_giornate_profilo_id_fkey(nome, cognome, colore_avatar, mansione, reparto)",
          )
          .eq("company_id", companyId)
          .gte("data", dateFrom)
          .lte("data", dateTo)
          .order("data", { ascending: true })
          .order("id", { ascending: true })
          .range(from, from + pageSize - 1)
          .abortSignal(signal);

        if (error) throw error;

        giornate.push(
          ...((data || []).map((g) => ({
            ...g,
            profilo_nome: g.hr_profili?.nome || "",
            profilo_cognome: g.hr_profili?.cognome || "",
            profilo_colore: g.hr_profili?.colore_avatar || "#0EA5E9",
            profilo_mansione: g.hr_profili?.mansione,
            profilo_reparto: g.hr_profili?.reparto,
          })) as GiornataWithProfilo[]),
        );
        if (!data || data.length < pageSize) return giornate;
      }
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}

export function useGiornateSummary(dateFrom: string, dateTo: string) {
  const {
    data: giornate = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useGiornate(dateFrom, dateTo);

  const presenti = giornate.filter((g) => g.stato === "presente").length;
  const assenti = giornate.filter((g) => g.stato === "assente").length;
  const ferie = giornate.filter((g) => g.stato === "ferie").length;
  const malattia = giornate.filter((g) => g.stato === "malattia").length;
  const oreTotali = giornate.reduce((sum, g) => sum + (g.ore_lavorate || 0), 0);
  const anomalie = giornate.filter((g) => g.anomalia).length;

  return {
    giornate,
    isLoading,
    isError,
    error,
    refetch,
    summary: { presenti, assenti, ferie, malattia, oreTotali, anomalie },
  };
}
