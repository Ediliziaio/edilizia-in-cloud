import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Collaborazione email: chi ha aperto/risposto/archiviato un thread.
 *
 * Modello: ogni utente ha la sua copia di una email (multi-tenant personal
 * inbox). La tabella `email_message_activity` traccia gli eventi per
 * `company_id` + `message_id` provider-side, così tutti i membri della
 * stessa company vedono "chi ha fatto cosa" sulla stessa email logica.
 *
 * NB: il tracking è best-effort. La vista è già scoped via RLS al
 * company_id dell'utente loggato.
 */

export type EmailActivityAction = "viewed" | "replied" | "forwarded" | "archived" | "trashed" | "starred";

export interface EmailThreadActivityEntry {
  thread_id: string;
  user_id: string;
  user_name: string | null;
  avatar_url: string | null;
  action: EmailActivityAction;
  email_address: string | null;
  oauth_connection_id: string | null;
  created_at: string;
}

/**
 * Recupera le attività più recenti per un thread (max 50 eventi).
 * Aggrega in `summary` per persona (1 entry per user/action, prende la
 * più recente). Esposto sia raw che aggregato per flessibilità UI.
 */
export function useThreadActivity(threadId: string | null, companyId: string | null | undefined) {
  return useQuery({
    queryKey: ["email-thread-activity", companyId, threadId],
    enabled: !!threadId && !!companyId,
    staleTime: 30_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("v_email_thread_activity")
        .select("thread_id, user_id, user_name, avatar_url, action, email_address, oauth_connection_id, created_at")
        .eq("thread_id", threadId)
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as EmailThreadActivityEntry[];
    },
  });
}

/**
 * Mark thread come visualizzato dall'utente loggato.
 * Chiama RPC `email_track_activity` con i provider message_id del thread.
 *
 * Idempotente lato DB (skip insert se stesso user ha già "viewed" lo stesso
 * message_id negli ultimi 5 min). Comunque debounce client-side a 1s per
 * non spammare in caso di switch rapido tra thread.
 */
export function useTrackThreadView({
  threadId,
  messageIds,
  companyId,
  oauthConnectionId,
  emailAddress,
}: {
  threadId: string | null;
  messageIds: string[];
  companyId: string | null | undefined;
  oauthConnectionId: string | null | undefined;
  emailAddress: string | null | undefined;
}) {
  const { user } = useAuth();
  const lastTrackedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!threadId || !companyId || !user?.id || messageIds.length === 0) return;
    // Debounce: stesso threadId in successione = un solo track.
    const fingerprint = `${threadId}::${messageIds.length}`;
    if (lastTrackedRef.current === fingerprint) return;
    const handle = setTimeout(() => {
      lastTrackedRef.current = fingerprint;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      void (supabase as any).rpc("email_track_activity", {
        p_message_ids: messageIds,
        p_company_id: companyId,
        p_thread_id: threadId,
        p_action: "viewed",
        p_oauth_connection_id: oauthConnectionId ?? null,
        p_email_address: emailAddress ?? null,
      });
    }, 1000);
    return () => clearTimeout(handle);
  }, [threadId, messageIds, companyId, user?.id, oauthConnectionId, emailAddress]);
}

/**
 * Helper: aggrega gli eventi in summary "X persone hanno aperto · Y ha
 * risposto da preventivi@…". Restituisce array ordinato per recency.
 */
export function summarizeThreadActivity(
  entries: EmailThreadActivityEntry[],
  excludeUserId?: string | null,
): Array<{
  user_id: string;
  user_name: string | null;
  avatar_url: string | null;
  last_action: EmailActivityAction;
  last_at: string;
  last_email_address: string | null;
  view_count: number;
  reply_count: number;
}> {
  const byUser = new Map<string, {
    user_id: string;
    user_name: string | null;
    avatar_url: string | null;
    last_action: EmailActivityAction;
    last_at: string;
    last_email_address: string | null;
    view_count: number;
    reply_count: number;
  }>();

  for (const e of entries) {
    if (excludeUserId && e.user_id === excludeUserId) continue;
    const existing = byUser.get(e.user_id);
    if (!existing) {
      byUser.set(e.user_id, {
        user_id: e.user_id,
        user_name: e.user_name,
        avatar_url: e.avatar_url,
        last_action: e.action,
        last_at: e.created_at,
        last_email_address: e.email_address,
        view_count: e.action === "viewed" ? 1 : 0,
        reply_count: e.action === "replied" || e.action === "forwarded" ? 1 : 0,
      });
    } else {
      if (e.created_at > existing.last_at) {
        existing.last_action = e.action;
        existing.last_at = e.created_at;
        existing.last_email_address = e.email_address;
      }
      if (e.action === "viewed") existing.view_count += 1;
      if (e.action === "replied" || e.action === "forwarded") existing.reply_count += 1;
    }
  }

  return [...byUser.values()].sort((a, b) => b.last_at.localeCompare(a.last_at));
}
