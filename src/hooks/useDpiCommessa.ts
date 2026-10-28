import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import type { QuadroDpi } from "@/lib/sicurezza/dpiCommessa";
export function useDpiCommessa(
  companyId: string,
  orderId: string,
  data: string,
  faseId?: string,
  contestoDisponibile = true,
) {
  const p = usePermissions();
  return useQuery({
    queryKey: [
      "sicurezza-dpi-commessa",
      companyId,
      orderId,
      data,
      faseId || null,
    ],
    enabled:
      contestoDisponibile &&
      !!companyId &&
      !!orderId &&
      !!data &&
      p.canViewSicurezzaCantiere,
    queryFn: async (): Promise<QuadroDpi> => {
      const { data: r, error } = await supabase.rpc(
        "sicurezza_dpi_commessa" as never,
        {
          _company: companyId,
          _ordine: orderId,
          _data: data,
          _fase: faseId || null,
        } as never,
      );
      if (error) throw error;
      if (
        !r ||
        !Array.isArray((r as unknown as QuadroDpi).addetti) ||
        (r as unknown as QuadroDpi).data !== data ||
        (r as unknown as QuadroDpi).fase_id !== (faseId || null)
      )
        throw new Error("Quadro DPI non disponibile");
      return r as unknown as QuadroDpi;
    },
    staleTime: 15000,
  });
}
