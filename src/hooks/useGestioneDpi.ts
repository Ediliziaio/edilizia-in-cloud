import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { readAllPages } from "@/lib/personale/readAllPages";
import { toast } from "sonner";
import type { ConsegnaDpi } from "@/lib/sicurezza/dpiCommessa";
import {
  erroriConsegnaDpi,
  type DatiConsegnaDpi,
  type EventoDpi,
} from "@/lib/sicurezza/gestioneDpi";
export interface SalvaDpi {
  id: string;
  titolareId: string;
  versione: number | null;
  requestId: string;
  dataRiferimento: string;
  faseId?: string;
  dati: DatiConsegnaDpi;
}
export function useSalvaDpi(companyId: string, orderId: string) {
  const p = usePermissions();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: SalvaDpi) => {
      if (
        !p.canViewSicurezzaCantiere ||
        p.solaLettura ||
        !companyId ||
        !orderId
      )
        throw new Error("Non puoi modificare il registro DPI.");
      const errori = erroriConsegnaDpi(v.dati);
      if (errori.length) throw new Error(errori.join(" "));
      const { data, error } = await supabase.rpc(
        "sicurezza_salva_dpi" as never,
        {
          _id: v.id,
          _company: companyId,
          _ordine: orderId,
          _employee: v.titolareId,
          _data: v.dataRiferimento,
          _fase: v.faseId || null,
          _versione: v.versione,
          _request: v.requestId,
          _dati: v.dati,
        } as never,
      );
      if (error)
        throw new Error(error.message || "La consegna non è stata salvata.");
      const r = data as unknown as ConsegnaDpi | null;
      if (
        !r ||
        r.id !== v.id ||
        !Number.isInteger(r.versione) ||
        !r.versione ||
        r.versione < 1
      )
        throw new Error("La registrazione DPI non è stata confermata.");
      return r;
    },
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ["sicurezza-dpi-commessa", companyId],
      });
      void qc.invalidateQueries({
        queryKey: ["sicurezza-dpi-storico", companyId],
      });
      toast.success("Registro DPI aggiornato");
    },
    onError: (e: Error) =>
      toast.error(
        e.message ||
          "Consegna non salvata. Rileggi il registro prima di riprovare.",
      ),
  });
}
export function useStoricoDpi(
  companyId: string,
  employeeId: string,
  consegnaId: string,
) {
  const p = usePermissions();
  return useQuery({
    queryKey: ["sicurezza-dpi-storico", companyId, employeeId, consegnaId],
    enabled:
      !!companyId && !!employeeId && !!consegnaId && p.canViewSicurezzaCantiere,
    queryFn: async (): Promise<EventoDpi[]> => {
      return (await readAllPages((from, to) =>
        supabase
          .from("employee_dpi_eventi" as never)
          .select(
            "id,company_id,employee_id,consegna_id,versione,operazione,prima,dopo,motivo,registrato_da,registrato_il",
          )
          .eq("company_id", companyId)
          .eq("employee_id", employeeId)
          .eq("consegna_id", consegnaId)
          .order("versione", { ascending: false })
          .order("id")
          .range(from, to),
      )) as unknown as EventoDpi[];
    },
  });
}
