import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { centralinoCalls, matchesCallParty } from "@/lib/centralinoCalls";
export function useCentralinoCalls(party: { contactId?: string | null; customerId?: string | null; phone?: string | null } = {}, limit = 100) {
  const companyId = useEffectiveCompanyId();
  return useQuery({ queryKey: ["centralino-calls",companyId,party.contactId,party.customerId,party.phone,limit],enabled:!!companyId,refetchInterval:20_000,queryFn:async()=>{
    const scope=(query:any)=>{
      const ids=[party.contactId && `contact_id.eq.${party.contactId}`,party.customerId && `customer_id.eq.${party.customerId}`].filter(Boolean);
      return ids.length?query.or(ids.join(",")):query;
    };
    const [human,ai] = await Promise.all([
      scope(supabase.from("human_call_logs" as never).select("*").eq("company_id",companyId!).order("started_at",{ascending:false}).limit(limit)),
      scope(supabase.from("ai_conversations_v2" as never).select("id,company_id,agent_id,voice_provider,direzione,numero_chiamante,numero_chiamato,stato,durata_secondi,iniziata_il,creato_il,contact_id,customer_id,audio_url,riassunto").eq("company_id",companyId!).eq("canale","voce").order("creato_il",{ascending:false}).limit(limit)),
    ]);
    if(human.error || ai.error) throw new Error("Storico chiamate non disponibile. Riprova.");
    let calls=centralinoCalls(human.data || [],ai.data || []);
    if(party.contactId || party.customerId || party.phone) calls=calls.filter(call=>matchesCallParty(call,party));
    const contacts=[...new Set(calls.map(c=>c.contactId).filter(Boolean))];
    const customers=[...new Set(calls.map(c=>c.customerId).filter(Boolean))];
    const [contactRows,customerRows]=await Promise.all([
      contacts.length ? supabase.from("marketing_contacts").select("id,first_name,last_name").eq("company_id",companyId!).in("id",contacts as string[]) : {data:[]},
      customers.length ? supabase.from("profiles").select("id,first_name,last_name,business_name").eq("company_id",companyId!).in("id",customers as string[]) : {data:[]},
    ]);
    const names=new Map([...contactRows.data || [],...customerRows.data || []].map((r:any)=>[r.id,r.business_name || [r.first_name,r.last_name].filter(Boolean).join(" ")]));
    return calls.slice(0,limit).map(c=>({...c,name:names.get(c.customerId || "") || names.get(c.contactId || "") || c.name}));
  }});
}
