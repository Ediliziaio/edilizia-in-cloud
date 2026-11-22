import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CentralinoCall } from "@/lib/centralinoCalls";

export function useCallTranscript(companyId?: string, callId?: string) {
  return useQuery({
    queryKey: ["centralino-call-detail", companyId, callId],
    enabled: !!companyId && !!callId,
    refetchInterval: (query) => query.state.error || query.state.data?.length ? false : 10_000,
    queryFn: async (): Promise<CentralinoCall["transcript"]> => {
      const { data, error } = await supabase
        .from("ai_conversations_v2")
        .select("trascrizione_json")
        .eq("company_id", companyId!)
        .eq("id", callId!)
        .maybeSingle();
      if (error) throw new Error("Trascrizione non leggibile. Riprova.");
      return Array.isArray(data?.trascrizione_json)
        ? data.trascrizione_json as CentralinoCall["transcript"]
        : [];
    },
  });
}
