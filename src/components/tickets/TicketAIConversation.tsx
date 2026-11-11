import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AudioLines, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
type Conversation={id:string;source_kind:string;status:string;summary:string|null;created_at:string;updated_at:string};
type Message={role?:string;text?:string;message?:string;final?:boolean};
export function TicketAIConversation({companyId,ticketId}:{companyId:string;ticketId:string}){
 const [opened,setOpened]=useState<string|null>(null);
 const history=useQuery({queryKey:["ticket-ai-conversations",companyId,ticketId],enabled:!!companyId && !!ticketId,
  queryFn:async()=>{const{data,error}=await supabase.from("ticket_ai_conversations" as never).select("id,source_kind,status,summary,created_at,updated_at").eq("company_id",companyId).eq("ticket_id",ticketId).order("created_at",{ascending:true}).limit(50);if(error)throw error;return(data || [])as unknown as Conversation[];},
  refetchInterval:query=>query.state.data?.some(item=>item.status==="in_corso")?5000:false});
 const transcript=useQuery({queryKey:["ticket-ai-transcript",companyId,ticketId,opened],enabled:!!opened,
  queryFn:async()=>{const{data,error}=await supabase.from("ticket_ai_conversations" as never).select("transcript").eq("company_id",companyId).eq("ticket_id",ticketId).eq("id",opened!).single();if(error)throw error;const rows=(data as unknown as {transcript:Message[]}).transcript;return Array.isArray(rows)?rows:[];},
  refetchInterval:history.data?.find(item=>item.id===opened)?.status==="in_corso"?5000:false});
 if(history.isLoading || (!history.isError && !history.data?.length))return null;
 return <section className="rounded-xl border bg-background p-5" aria-label="Conversazioni con l’assistente AI"><div className="flex items-center gap-2"><AudioLines className="h-5 w-5 text-emerald-700"/><h2 className="text-lg font-semibold">Conversazione con l’assistente AI</h2></div><p className="mt-2 text-sm leading-6 text-muted-foreground">Il dialogo che ha portato alla segnalazione, con le correzioni e la conferma del cliente.</p>
 {history.isError?<div role="alert" className="mt-3 text-sm">Non riesco a caricare la conversazione. <Button variant="link" onClick={()=>void history.refetch()}>Riprova</Button></div>:history.data?.map(item=><div key={item.id} className="mt-4 rounded-lg border"><Button variant="ghost" className="h-auto w-full justify-between gap-4 whitespace-normal px-4 py-3 text-left" aria-expanded={opened===item.id} onClick={()=>setOpened(opened===item.id?null:item.id)}><span>{item.source_kind==="crm_trial"?"Prova dal gestionale":"Chiamata telefonica"} · {new Date(item.created_at).toLocaleString("it-IT")}<span className="mt-1 block text-xs font-normal text-muted-foreground">{item.status==="in_corso"?"Conversazione in corso · aggiornamento automatico":item.status==="non_disponibile"?"Prova precedente · trascrizione non conservata":"Conversazione conclusa"}</span></span><ChevronDown className="h-4 w-4 shrink-0"/></Button>
 {opened===item.id && <div className="space-y-3 border-t p-4">{item.summary && <p className="text-sm leading-6">{item.summary}</p>}{transcript.isError?<div role="alert" className="text-sm">Non riesco a leggere il dialogo. <Button variant="link" onClick={()=>void transcript.refetch()}>Riprova</Button></div>:transcript.isFetching && !transcript.data?<p className="text-sm">Carico la conversazione…</p>:!transcript.data?.length?<p className="text-sm text-muted-foreground">{item.status==="non_disponibile"?"Questa prova è stata svolta prima del salvataggio delle conversazioni. Non è disponibile una trascrizione completa.":"Il dialogo sarà disponibile appena arrivano le prime risposte."}</p>:<div className="max-h-[32rem] space-y-3 overflow-y-auto" aria-label="Trascrizione collegata al ticket">{transcript.data.map((message,index)=><div key={index} className={`max-w-[94%] rounded-xl border p-3 text-sm leading-6 ${message.role==="user"?"ml-auto border-emerald-100 bg-emerald-50":"bg-muted/30"}`}><p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{message.role==="user"?"Cliente":"Assistente AI"}</p><p className="whitespace-pre-wrap">{message.text || message.message}</p></div>)}</div>}{item.source_kind==="phone" && <Link className="inline-block text-xs underline" to="/azienda/centralino">Apri lo storico del centralino per l’eventuale registrazione</Link>}</div>}
 </div>)}
 </section>;
}
