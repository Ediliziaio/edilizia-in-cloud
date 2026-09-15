import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { withClientTimeout } from "@/lib/query-timeout";
import { contaEmailNonLette, LIMITE_RIGHE_EMAIL, type ConteggiEmail } from "@/lib/badgeConteggi";

/**
 * - `unread`: email non lette nella inbox (escluso archiviate/cestino).
 * - `urgent`: email non lette con priorità alta.
 *
 * 15/09/2026: tolto `commercial` (lead/preventivo), che nessun componente leggeva
 * e costava una richiesta a parte a ogni giro.
 */
export type EmailCounts = ConteggiEmail;

/**
 * Conteggia le email non lette dell'utente loggato.
 *
 * Usato dal badge della voce "Email" in sidebar (CompanyLayout). Il timeout
 * corto evita che una RLS lenta blocchi il rendering della sidebar.
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
    // 15/09/2026: 30s → 120s, e mai con la scheda nascosta. La sync inbox gira
    // lato server ogni pochi minuti: un giro più stretto non mostrava prima nulla.
    // Tornando sulla scheda si aggiorna subito (refetchOnWindowFocus).
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 60_000,
    // 2026-05-27: silent — è un badge sidebar, se va in timeout il valore
    // precedente resta visualizzato ed è OK. Mostrare un toast utente per un
    // count badge che si autoricarica è rumore, non informazione.
    meta: { silent: true },
    queryFn: async (): Promise<EmailCounts> => {
      if (!userId || !companyId) return { unread: 0, urgent: 0 };

      // Una sola richiesta: il count esatto dà il totale non lette, le righe
      // ordinate per priorità ("alta" < "media" < "nessuna") portano le urgenti
      // in testa, così bastano poche righe per contarle.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const query = (supabase as any)
        .from("email_inbox")
        .select("ai_priority", { count: "exact" })
        .eq("user_id", userId)
        .eq("company_id", companyId)
        .eq("is_read", false)
        .eq("is_archived", false)
        .eq("is_trashed", false)
        .order("ai_priority", { ascending: true, nullsFirst: false })
        .limit(LIMITE_RIGHE_EMAIL);

      // 2026-05-27: timeout da 8 → 12s. Su mobile 4G + RLS con join, 8s
      // era troppo stringente e l'utente vedeva toast errore intermittenti.
      const res = await withClientTimeout(query, "Conteggio email non lette", 12_000);
      if (res.error) throw res.error;

      return contaEmailNonLette(res.data as { ai_priority: string | null }[] | null, res.count);
    },
  });
}
