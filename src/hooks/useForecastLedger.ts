import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { dayKey } from "@/lib/finance/forecastLedger";
import { loadForecastDataset as caricaPrevisionale, type ReadClient } from "@/lib/finance/caricaPrevisionale";

// Il caricamento vive in lib/finance/caricaPrevisionale.ts (08/11/2026), condiviso con le
// edge function. Qui restano il client del browser e l'hook.
export { FORECAST_PAGE_SIZE, readForecastPages, type ForecastDataset } from "@/lib/finance/caricaPrevisionale";
const api = supabase as unknown as ReadClient;
export const loadForecastDataset = (companyId: string, today: string, client: ReadClient = api) =>
  caricaPrevisionale(companyId, today, client);

export function useForecastLedger() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const [today, setToday] = useState(() => dayKey(new Date()));
  const queryClient = useQueryClient();
  useEffect(() => {
    const timer = window.setInterval(
      () => setToday(dayKey(new Date())),
      60_000,
    );
    return () => window.clearInterval(timer);
  }, []);
  useEffect(
    () =>
      queryClient.getQueryCache().subscribe((event) => {
        if (event.type !== "updated" || event.action.type !== "invalidate")
          return;
        const key = event.query.queryKey;
        if (
          key[0] === "cashflow" &&
          key[1] !== "ledger" &&
          key.includes(companyId)
        )
          void queryClient.invalidateQueries({
            queryKey: ["cashflow", "ledger", companyId],
          });
      }),
    [companyId, queryClient],
  );
  return useQuery({
    queryKey: ["cashflow", "ledger", companyId, today],
    enabled: !!companyId,
    queryFn: () => loadForecastDataset(companyId!, today),
    // Diciotto fonti: si ricarica con «Aggiorna» o quando un'altra pagina invalida i dati, non a
    // ogni ritorno sulla finestra.
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}
