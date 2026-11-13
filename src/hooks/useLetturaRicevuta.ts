import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
type Lettura = { id: string; stato: string; da_leggere: boolean };
export function useLetturaRicevuta(companyId: string | null | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      daLeggere,
    }: {
      id: string;
      daLeggere: boolean;
    }) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      const { data, error } = await supabase.rpc(
        "fattura_ricevuta_lettura" as never,
        {
          p_company: companyId,
          p_fattura: id,
          p_da_leggere: daLeggere,
        } as never,
      );
      if (error) throw error;
      const result = data as unknown as Lettura;
      if (!result || result.id !== id || typeof result.da_leggere !== "boolean")
        throw new Error("Stato di lettura non aggiornato");
      return result;
    },
    onSuccess: (updated) => {
      // Update badges and derived counters immediately, without downloading the entire register.
      client.setQueriesData<
        ({ id: string; stato: string; da_leggere?: boolean | null } & Record<
          string,
          unknown
        >)[]
      >({ queryKey: ["fatture-ricevute", companyId] }, (rows) =>
        Array.isArray(rows)
          ? rows.map((row) =>
              row.id === updated.id ? { ...row, ...updated } : row,
            )
          : rows,
      );
      client.setQueryData<{ fattura: Record<string, unknown> }>(
        ["fattura-ricevuta-riepilogo", companyId, updated.id],
        (old) =>
          old ? { ...old, fattura: { ...old.fattura, ...updated } } : old,
      );
      void client.invalidateQueries({
        queryKey: ["fatture-ricevute-tipi-fornitori", companyId],
      });
    },
    onError: (error) =>
      toast.error("Stato di lettura non aggiornato", {
        description: error instanceof Error ? error.message : String(error),
      }),
  });
}
