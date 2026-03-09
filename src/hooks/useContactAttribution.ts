import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useContactAttribution(contactId: string | undefined, companyId: string | undefined) {
  const { data: attribution, isLoading: loadingAttribution } = useQuery({
    queryKey: ["contact-attribution", contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_attributions")
        .select("*")
        .eq("contact_id", contactId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!contactId && !!companyId,
  });

  const { data: sessions, isLoading: loadingSessions } = useQuery({
    queryKey: ["contact-attribution-sessions", contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attribution_sessions")
        .select("*")
        .eq("contact_id", contactId!)
        .order("started_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
    enabled: !!contactId && !!companyId,
  });

  return {
    attribution,
    sessions: sessions || [],
    isLoading: loadingAttribution || loadingSessions,
  };
}
