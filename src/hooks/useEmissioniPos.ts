import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apriUrlDocumentoPos } from "@/lib/sicurezza/apriPdfPos";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { chiamaServerPos, emettiPos } from "@/hooks/usePos";
import { readAllPages } from "@/lib/personale/readAllPages";

export interface EmissionePos {
  id: string; revisione: number; stato: "preparazione" | "completa" | "errore";
  origine: "approvazione_corrente" | "ricostruzione_da_contenuto_archiviato";
  emesso_il: string; updated_at: string; snapshot_id: string | null; errore: string | null;
  manifest: { generatore: string; avvertenza: string; file: Array<{ ruolo: string; nome: string; nomeOriginale?: string; sha256: string; dimensione: number }> } | null;
}
export interface ContenutoPerEmissione { id: string; revisione: number; fonte: string; acquisito_il: string }

export function useEmissioniPos(companyId: string, posId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["pos", "emissioni", companyId, posId], enabled: enabled && !!companyId && !!posId,
    queryFn: () => readAllPages<EmissionePos>((from,to) => supabase.from("pos_emissioni" as never)
      .select("id,revisione,stato,origine,emesso_il,updated_at,snapshot_id,errore,manifest").eq("company_id",companyId).eq("pos_id",posId)
      .order("revisione",{ascending:false}).order("id").range(from,to) as never),
    refetchInterval: q => q.state.data?.some(e=>e.stato==="preparazione") ? 5000 : false,
  });
}
export function useContenutiPerEmissione(companyId: string, posId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["pos", "contenuti-per-emissione", companyId, posId], enabled: enabled && !!companyId && !!posId,
    queryFn: () => readAllPages<ContenutoPerEmissione>((from,to) => supabase.from("pos_contenuti_archiviati" as never)
      .select("id,revisione,fonte,acquisito_il").eq("company_id",companyId).eq("pos_id",posId)
      .order("revisione",{ascending:false}).order("id").range(from,to) as never),
  });
}
export function usePreparaEmissione(companyId: string, posId: string) {
  const qc=useQueryClient();
  return useMutation({
    mutationFn: async (snapshotId: string) => ({ emissione_id: (await emettiPos({ companyId, posId, snapshotId })).emissioneId ?? "" }),
    onSuccess:()=>toast.success("Copia conservata con PDF, allegati e impronte"),
    onError:e=>toast.error(e instanceof Error?e.message:"Emissione non completata"),
    onSettled:()=>qc.invalidateQueries({queryKey:["pos"]}),
  });
}
export function apriEmissionePos(companyId: string, id: string, tipo: "pdf" | "zip") {
  return apriUrlDocumentoPos(async()=>{
    const {url}=await chiamaServerPos<{url:string}>({azione:"scarica_emissione",company_id:companyId,emissione_id:id,tipo});
    return url;
  });
}
