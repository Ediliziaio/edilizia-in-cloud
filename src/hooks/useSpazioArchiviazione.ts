/** Spazio di archiviazione dell'azienda: usato, limite del piano, per tipo e per commessa. */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";

export interface SpazioArchiviazione {
  byte_usati: number;
  file: number;
  /** null o -1 = senza limite. */
  limite_mb: number | null;
  piano: string | null;
  voci: { categoria: string; byte: number; file: number }[];
  commesse: { order_id: string; codice: string | null; titolo: string | null; byte: number; file: number }[];
}

export const chiaveSpazio = (companyId: string | null | undefined) => ["spazio-archiviazione", companyId];

export function useSpazioArchiviazione(enabled = true) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: chiaveSpazio(companyId),
    enabled: enabled && !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<SpazioArchiviazione> => {
      const { data, error } = await supabase.rpc("spazio_archiviazione" as never, { p_company_id: companyId } as never);
      if (error) throw error;
      return data as unknown as SpazioArchiviazione;
    },
  });
}

/** Byte ancora liberi; null = senza limite. */
export function byteLiberi(s: SpazioArchiviazione | undefined): number | null {
  if (!s || s.limite_mb == null || s.limite_mb < 0) return null;
  return Math.max(0, s.limite_mb * 1024 * 1024 - s.byte_usati);
}
