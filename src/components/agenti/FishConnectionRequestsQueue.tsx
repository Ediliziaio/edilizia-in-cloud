import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useUnifiedAgents } from "@/hooks/useUnifiedAgents";
import { supabase } from "@/integrations/supabase/client";
import { connectionStatusLabel } from "@/lib/fishOnboarding";
import { FishNumberConnectionRequest } from "./FishNumberConnectionRequest";
import { Button } from "@/components/ui/button";
export function FishConnectionRequestsQueue({companyId}:{companyId:string}) {
  const auth=useAuth();
  const canReview=auth.role==="super_admin" && !auth.viewAsRole;
  const {data:agents=[]}=useUnifiedAgents();
  const requests=useQuery({queryKey:["fish-connection-queue",companyId],enabled:canReview,retry:false,queryFn:async()=>{
    const {data,error}=await supabase.from("ai_fish_connection_requests" as never).select("id,agent_id,status,existing_number,created_at").eq("company_id",companyId).order("created_at",{ascending:false}).limit(100);
    if(error)throw error;return (data || []) as {id:string;agent_id:string;status:string;existing_number:string|null;created_at:string}[];
  }});
  if(!canReview)return null;
  return <section className="space-y-4 rounded-2xl border bg-card p-5"><div><h2 className="font-semibold">Richieste di collegamento</h2><p className="mt-1 text-sm text-muted-foreground">Richieste dell’azienda corrente, visibili alla piattaforma.</p></div>{requests.isError?<div role="alert" className="text-sm">Non riesco a leggere le richieste.<Button variant="ghost" onClick={()=>requests.refetch()}>Riprova</Button></div>:requests.isPending?<p className="text-sm text-muted-foreground">Caricamento richieste…</p>:!requests.data?.length?<p className="text-sm text-muted-foreground">Nessuna richiesta di collegamento per questa azienda.</p>:requests.data.map(request=><details key={request.id} className="rounded-xl border p-4"><summary className="cursor-pointer text-sm font-medium">{agents.find(agent=>agent.id===request.agent_id)?.nome || "Assistente"} · {request.existing_number || "Nuova linea"} · {connectionStatusLabel[request.status]}</summary><div className="mt-4"><FishNumberConnectionRequest companyId={companyId} agentId={request.agent_id}/></div></details>)}</section>;
}
