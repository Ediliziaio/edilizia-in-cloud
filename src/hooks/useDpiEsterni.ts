import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { readAllPages } from "@/lib/personale/readAllPages";
import { apriFileFascicolo } from "@/hooks/useFascicoloCantiere";
import { toast } from "sonner";
import type {
  AddettoDpi,
  ConsegnaDpi,
  VerbaleDpi,
} from "@/lib/sicurezza/dpiCommessa";
import { erroriConsegnaDpi, type EventoDpi } from "@/lib/sicurezza/gestioneDpi";
import type { SalvaDpi } from "@/hooks/useGestioneDpi";
export interface AmbitoDpiEsterni {
  companyId: string;
  subId: string;
  orderId?: string;
  data: string;
  faseId?: string;
  operaioId?: string;
}
export interface ConsegnaDpiEsterno extends ConsegnaDpi {
  verbale_cambiato: boolean;
  verbale_pertinente: boolean | null;
  verbale_corrente: VerbaleDpi | null;
}
export interface QuadroDpiEsterni {
  company_id: string;
  sub_id: string;
  order_id: string | null;
  data: string;
  fase_id: string | null;
  addetti: (Omit<AddettoDpi, "consegne"> & {
    consegne: ConsegnaDpiEsterno[];
  })[];
  evidenze: VerbaleDpi[];
}
export async function leggiDpiEsterni(
  a: AmbitoDpiEsterni,
): Promise<QuadroDpiEsterni> {
  const { data, error } = await supabase.rpc(
    "sub_dpi_quadro" as never,
    {
      _company: a.companyId,
      _sub: a.subId,
      _ordine: a.orderId || null,
      _data: a.data,
      _fase: a.faseId || null,
      _operaio: a.operaioId || null,
    } as never,
  );
  if (error) throw new Error(error.message);
  const r = data as unknown as QuadroDpiEsterni | null;
  if (
    !r ||
    r.company_id !== a.companyId ||
    r.sub_id !== a.subId ||
    r.order_id !== (a.orderId || null) ||
    r.data !== a.data ||
    r.fase_id !== (a.faseId || null) ||
    !Array.isArray(r.addetti) ||
    !Array.isArray(r.evidenze)
  )
    throw new Error("Dotazioni esterne non disponibili per questo contesto.");
  return r;
}
export function useDpiEsterni(a: AmbitoDpiEsterni, aperto = true) {
  const p = usePermissions();
  return useQuery({
    queryKey: [
      "sub-dpi-quadro",
      a.companyId,
      a.subId,
      a.orderId || null,
      a.data,
      a.faseId || null,
      a.operaioId || null,
    ],
    enabled: aperto && !!a.companyId && !!a.subId && p.canViewSicurezzaCantiere,
    queryFn: () => leggiDpiEsterni(a),
    staleTime: 15000,
  });
}
export function useSalvaDpiEsterni(
  a: Pick<AmbitoDpiEsterni, "companyId" | "subId" | "orderId">,
) {
  const p = usePermissions();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: SalvaDpi) => {
      if (
        !p.canViewSicurezzaCantiere ||
        p.solaLettura ||
        !a.companyId ||
        !a.subId
      )
        throw new Error("Non puoi modificare le dotazioni esterne.");
      const e = erroriConsegnaDpi(v.dati);
      if (e.length) throw new Error(e.join(" "));
      const { data, error } = await supabase.rpc(
        "sub_dpi_salva" as never,
        {
          _id: v.id,
          _company: a.companyId,
          _sub: a.subId,
          _operaio: v.titolareId,
          _ordine: a.orderId || null,
          _data: v.dataRiferimento,
          _fase: v.faseId || null,
          _versione: v.versione,
          _request: v.requestId,
          _dati: v.dati,
        } as never,
      );
      if (error) throw new Error(error.message);
      const r = data as unknown as ConsegnaDpi | null;
      if (
        !r ||
        r.id !== v.id ||
        !Number.isInteger(r.versione) ||
        !r.versione ||
        r.versione < 1
      )
        throw new Error("Salvataggio della dotazione non confermato.");
      return r;
    },
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ["sub-dpi-quadro", a.companyId, a.subId],
      });
      void qc.invalidateQueries({
        queryKey: ["sub-dpi-storico", a.companyId, a.subId],
      });
      toast.success("Dotazioni dell’impresa esterna aggiornate");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
export function useStoricoDpiEsterni(
  companyId: string,
  subId: string,
  operaioId: string,
  consegnaId: string,
) {
  const p = usePermissions();
  return useQuery({
    queryKey: ["sub-dpi-storico", companyId, subId, operaioId, consegnaId],
    enabled: !!companyId && !!subId && p.canViewSicurezzaCantiere,
    queryFn: async (): Promise<EventoDpi[]> =>
      (await readAllPages((from, to) =>
        supabase
          .from("subappaltatori_dpi_eventi" as never)
          .select(
            "id,company_id,operaio_id,consegna_id,versione,operazione,prima,dopo,motivo,registrato_da,registrato_il",
          )
          .eq("company_id", companyId)
          .eq("subappaltatore_id", subId)
          .eq("operaio_id", operaioId)
          .eq("consegna_id", consegnaId)
          .order("versione", { ascending: false })
          .order("id")
          .range(from, to),
      )) as unknown as EventoDpi[],
  });
}
export async function apriVerbaleDpiEsterno(
  a: AmbitoDpiEsterni,
  operaioId: string,
  v: VerbaleDpi,
) {
  const { data, error } = await supabase.rpc(
    "sub_dpi_apri_verbale" as never,
    {
      _company: a.companyId,
      _sub: a.subId,
      _operaio: operaioId,
      _evidenza: v.id,
      _ordine: a.orderId || null,
      _data: a.data,
      _fase: a.faseId || null,
      _impronta: v.impronta,
    } as never,
  );
  if (error) throw new Error(error.message);
  if (typeof data !== "string" || !data)
    throw new Error("Percorso del verbale non disponibile.");
  await apriFileFascicolo(data);
}
