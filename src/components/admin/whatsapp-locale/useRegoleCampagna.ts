import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type TipoConfronto = "any" | "contains" | "equals" | "starts_with";

/** Una regola «Quando risponde» di una campagna WhatsApp Locale (openwa_rules con campagna_id). */
export interface RegolaCampagna {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  campagna_id: string;
  match_type: TipoConfronto;
  match_keywords: string[];
  only_first_contact: boolean;
  only_outside_hours: boolean;
  reply_text: string | null;
  add_tags: string[];
  assign_to: string | null;
  notify_email: string | null;
  ferma_flusso: boolean;
  imposta_esito: string | null;
  optout: boolean;
  created_at: string;
}

/** Le regole della campagna, nell'ordine in cui le valuta il webhook. */
export function useRegoleCampagna(campagnaId: string) {
  return useQuery({
    queryKey: ["openwa", "rules", "campagna", campagnaId],
    staleTime: 30_000,
    queryFn: async () => {
      // openwa_rules non ha ancora campagna_id nei tipi generati.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("openwa_rules")
        .select("id, name, enabled, priority, campagna_id, match_type, match_keywords, only_first_contact, only_outside_hours, reply_text, add_tags, assign_to, notify_email, ferma_flusso, imposta_esito, optout, created_at")
        .eq("campagna_id", campagnaId)
        .order("priority", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as RegolaCampagna[];
    },
  });
}
