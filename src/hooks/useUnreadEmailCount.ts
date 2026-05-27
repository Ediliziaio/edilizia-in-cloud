import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { withClientTimeout } from "@/lib/query-timeout";

export interface EmailCounts {
  /** Email non lette nella inbox (escluso archiviate/cestino/spam). */
  unread: number;
  /** Email non lette con priorità alta (urgenti). */
  urgent: number;
  /** Email non lette classificate come lead/preventivo. */
  commercial: number;
}

/**
 * Conteggia le email non lette dell'utente loggato.
 *
 * Usato dal badge della voce "Email" in sidebar (CompanyLayout) — pattern
 * identico a `useMyTaskCount`, con refetch ogni 30s per restare allineato
 * con la sync inbox in background. Il timeout corto evita che una RLS lenta
 * blocchi il rendering della sidebar.
 *
 * Variante UI consigliata sul badge:
 *   - `urgent > 0`  → destructive (rosso)
 *   - `unread > 0`  → secondary (grigio)
 *   - `unread = 0`  → niente badge
 */
export function useUnreadEmailCount(): {
  data: EmailCounts | null;
  isLoading: boolean;
} {
  const { user, effectiveCompany } = useAuth();
  const userId = user?.id;
  const companyId = effectiveCompany?.id;

  return useQuery({
    queryKey: ["unread-email-count", userId, companyId],
    enabled: !!userId && !!companyId,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    staleTime: 15_000,
    queryFn: async (): Promise<EmailCounts> => {
      if (!userId || !companyId) return { unread: 0, urgent: 0, commercial: 0 };

      // Conteggio diretto su email_inbox: la RLS owner-only restituisce solo
      // le email dell'utente loggato, quindi il filtro user_id è ridondante
      // ma esplicito per chiarezza.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const baseQuery = () => (supabase as any)
        .from("email_inbox")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("company_id", companyId)
        .eq("is_read", false)
        .eq("is_archived", false)
        .eq("is_trashed", false);

      const [unreadRes, urgentRes, commercialRes] = await Promise.all([
        withClientTimeout(baseQuery(), "Conteggio email non lette", 8_000),
        withClientTimeout(baseQuery().eq("ai_priority", "alta"), "Conteggio email urgenti", 8_000),
        withClientTimeout(baseQuery().in("ai_category", ["lead", "quote"]), "Conteggio email commerciali", 8_000),
      ]);

      const error = unreadRes.error || urgentRes.error || commercialRes.error;
      if (error) throw error;

      return {
        unread: unreadRes.count ?? 0,
        urgent: urgentRes.count ?? 0,
        commercial: commercialRes.count ?? 0,
      };
    },
  });
}
