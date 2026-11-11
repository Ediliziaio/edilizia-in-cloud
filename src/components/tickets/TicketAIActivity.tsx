import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
type Activity={id:string;note:string;source_kind:string;created_at:string};
export function TicketAIActivity({companyId,ticketId}:{companyId:string;ticketId:string}){
 const activity=useQuery({queryKey:["ticket-ai-actions",companyId,ticketId],enabled:!!companyId && !!ticketId,staleTime:15000,
  queryFn:async()=>{const{data,error}=await supabase.from("ticket_ai_actions" as never).select("id,note,source_kind,created_at").eq("company_id",companyId).eq("ticket_id",ticketId).order("created_at",{ascending:false}).limit(50);if(error)throw error;return(data || [])as unknown as Activity[];}});
 if(!activity.data?.length && !activity.isError)return null;
 return <section className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-5" aria-label="Aggiornamenti raccolti dall’assistente"><h2 className="font-semibold">Aggiornamenti raccolti dall’assistente</h2><p className="mt-1 text-sm text-muted-foreground">I richiami sulla stessa segnalazione, senza duplicare la richiesta iniziale.</p>{activity.isError?<p role="alert" className="mt-3 text-sm">Non riesco a caricare gli aggiornamenti. <button className="underline" onClick={()=>void activity.refetch()}>Riprova</button></p>:activity.data?.map(item=><article key={item.id} className="mt-3 rounded-xl border bg-background p-4"><p className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString("it-IT")} · {item.source_kind==="crm_trial"?"Collaudo dal gestionale":"Chiamata AI"}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{item.note}</p></article>)}</section>;
}
