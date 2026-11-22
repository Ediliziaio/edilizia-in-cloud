import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type FishCallback = {
  id: string;
  fish_call_id: string;
  contact_id: string | null;
  title: string;
  notes: string | null;
  status: string;
  due_date: string | null;
};

export function useFishCallbacks(
  companyId: string | null | undefined,
  filters: { callId?: string; callbackId?: string },
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["fish-callbacks", companyId, filters.callId, filters.callbackId],
    enabled: !!companyId && enabled,
    retry: false,
    refetchInterval: 20_000,
    queryFn: async (): Promise<FishCallback[]> => {
      let query = supabase.from("tasks")
        .select("id,fish_call_id,contact_id,title,notes,status,due_date")
        .eq("company_id", companyId!)
        .not("fish_call_id", "is", null);
      if (filters.callId) query = query.eq("fish_call_id", filters.callId);
      if (filters.callbackId) query = query.eq("id", filters.callbackId);
      const { data, error } = await query.order("created_at", { ascending: false }).limit(100);
      if (error) throw new Error("Richiami non disponibili. Riprova.");
      return (data || []) as FishCallback[];
    },
  });
}
