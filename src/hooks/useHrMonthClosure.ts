import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";
type Closure = { company_id: string; mese: string; stato: "aperto" | "chiuso"; revisione: number; chiuso_il: string | null; riaperto_il: string | null };
type Event = { id: string; revisione: number; stato: string; registrato_il: string; motivo: string; attore: string };
export function useHrMonthClosure(month: string) {
  const companyId=useEffectiveCompanyId(), p=usePermissions(), qc=useQueryClient();
  const canEdit=!!companyId && !p.isLoading && !p.solaLettura && p.isAdmin;
  const query=useQuery({
    queryKey:["hr-month-closure",companyId,month],enabled:!!companyId && !p.isLoading,
    queryFn:async()=>{
      const {data,error}=await supabase.from("hr_chiusure_mensili" as never)
        .select("company_id,mese,stato,revisione,chiuso_il,riaperto_il").eq("company_id",companyId!).eq("mese",`${month}-01`).maybeSingle();
      if(error)throw error;
      return data as unknown as Closure|null;
    },staleTime:30_000,
  });
  const history=useQuery({
    queryKey:["hr-month-history",companyId,month],enabled:!!companyId && !p.isLoading && p.isAdmin,
    queryFn:async()=>{
      const {data,error}=await supabase.from("hr_chiusure_storico" as never)
        .select("id,revisione,stato,registrato_il,motivo,attore").eq("company_id",companyId!).eq("mese",`${month}-01`).order("revisione",{ascending:false}).limit(50);
      if(error)throw error;
      return (data||[]) as unknown as Event[];
    },staleTime:30_000,
  });
  const change=useMutation({
    mutationFn:async({state,reason}:{state:"aperto"|"chiuso";reason:string})=>{
      if(!canEdit)throw new Error("Riapertura e chiusura riservate agli amministratori autorizzati");
      if(query.isError || query.isPending)throw new Error("Aggiorna prima lo stato del mese");
      if(reason.trim().length<5)throw new Error("Inserisci un motivo di almeno 5 caratteri");
      const {data,error}=await supabase.rpc("hr_transizione_mese" as never,{p_company:companyId,p_mese:`${month}-01`,p_revisione:query.data?.revisione || 0,p_stato:state,p_motivo:reason.trim()} as never);
      if(error)throw new Error(error.message);
      if(!data)throw new Error("Transizione non confermata dal server");
    },
    onSuccess:(_,input)=>toast.success(input.state==="chiuso"?"Mese HR chiuso: modifiche bloccate":"Mese HR riaperto: motivo registrato nello storico"),
    onError:(error)=>toast.error(error instanceof Error?error.message:"Transizione non riuscita"),
    onSettled:()=>{
      for(const key of ["hr-month-closure","hr-month-history","hr-giornate","hr-richieste"])void qc.invalidateQueries({queryKey:[key]});
    },
  });
  return {query,history,canEdit,change};
}
