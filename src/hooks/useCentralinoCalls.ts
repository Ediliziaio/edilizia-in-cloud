import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { centralinoCalls, matchesCallParty } from "@/lib/centralinoCalls";

export type CentralinoCallFilters = {
  contactId?: string | null;
  customerId?: string | null;
  phone?: string | null;
  agentId?: string;
  kind?: "ai" | "human";
};

export function useCentralinoCalls(filters: CentralinoCallFilters = {}, limit = 100) {
  const companyId = useEffectiveCompanyId();
  const { contactId, customerId, phone, agentId, kind } = filters;
  return useQuery({
    queryKey: ["centralino-calls", companyId, contactId, customerId, phone, limit, agentId, kind],
    enabled: !!companyId,
    refetchInterval: 20_000,
    queryFn: async () => {
      const scope = (query: any) => {
        const ids = [contactId && `contact_id.eq.${contactId}`, customerId && `customer_id.eq.${customerId}`].filter(Boolean);
        return ids.length ? query.or(ids.join(",")) : query;
      };
      let aiQuery = supabase.from("ai_conversations_v2").select(
        "id,company_id,agent_id,voice_provider,direzione,numero_chiamante,numero_chiamato,stato,durata_secondi,iniziata_il,creato_il,contact_id,customer_id,audio_url,riassunto,elevenlabs_conversation_id,sentiment,costo_crediti",
      ).eq("company_id", companyId!).eq("canale", "voce");
      if (agentId) aiQuery = aiQuery.eq("agent_id", agentId);
      const empty: { data: never[]; error: null } = { data: [], error: null };
      const [human, ai] = await Promise.all([
        kind === "ai" || agentId ? empty : scope(supabase.from("human_call_logs").select("*")
          .eq("company_id", companyId!).order("started_at", { ascending: false }).limit(limit)),
        kind === "human" && !agentId ? empty : scope(aiQuery.order("creato_il", { ascending: false }).limit(limit)),
      ]);
      if (human.error || ai.error) throw new Error("Storico chiamate non disponibile. Riprova.");
      let calls = centralinoCalls(human.data || [], ai.data || []);
      if (contactId || customerId || phone) calls = calls.filter(call => matchesCallParty(call, filters));
      calls = calls.slice(0, limit);
      const contacts = [...new Set(calls.flatMap(c => c.contactId ? [c.contactId] : []))];
      const customers = [...new Set(calls.flatMap(c => c.customerId ? [c.customerId] : []))];
      const [contactRows, customerRows] = await Promise.all([
        contacts.length ? supabase.from("marketing_contacts").select("id,first_name,last_name")
          .eq("company_id", companyId!).in("id", contacts) : empty,
        customers.length ? supabase.from("profiles").select("id,first_name,last_name,business_name")
          .eq("company_id", companyId!).in("id", customers) : empty,
      ]);
      const names = new Map((contactRows.data || []).map(row => [row.id, [row.first_name, row.last_name].filter(Boolean).join(" ")]));
      for (const row of customerRows.data || []) {
        names.set(row.id, row.business_name || [row.first_name, row.last_name].filter(Boolean).join(" "));
      }
      return calls.map(c => ({ ...c, name: names.get(c.customerId || "") || names.get(c.contactId || "") || c.name }));
    },
  });
}
