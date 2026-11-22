import { useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";
import { toast } from "sonner";
import { playNotificationSound } from "@/lib/notificationSound";
import { percorsoNotifica } from "@/lib/notifiche/percorsoNotifica";
import { isNative } from "@/lib/mobile/platform";
import { subscribeChannel } from "@/lib/realtime/subscribeChannel";

export interface Notification {
  id: string;
  company_id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  action_url: string | null;
  is_read: boolean;
  is_dismissed: boolean;
  created_at: string;
}

/**
 * 2026-05-27 (Performance audit Fix 1): realtime subscription estratta da
 * `useNotifications` per evitare DUPLICAZIONE. Prima: 3 componenti che
 * montavano `useNotifications` (NotificationsBellPopover, MobileBottomNav,
 * MobileAppGrid) → 3 WebSocket separati per la stessa tabella `notifications`
 * con identico filtro → 3 callback per ogni INSERT → 3 toast + 3 sound.
 *
 * Ora la subscription vive in un componente standalone (`<NotificationsRealtime />`)
 * montato 1x in CompanyLayout. `useNotifications()` resta consumer puro
 * (query + mutations) — React Query deduplica i fetch via queryKey, quindi
 * chiamarlo N volte non costa nulla.
 *
 * Il suffisso random nel channelId è ora superfluo (un solo canale per sessione)
 * ma lo manteniamo per safety in StrictMode (effect doppio in dev).
 */
export function NotificationsRealtime({
  trasformaLink,
}: {
  /** Nel campo i link dell'ufficio vanno tradotti (linkPerCampo). */
  trasformaLink?: (url: string) => string;
} = {}): null {
  const { profile, effectiveCompany } = useAuth();
  const navigate = useNavigate();
  const naviga = useRef(navigate);
  useEffect(() => { naviga.current = navigate; }, [navigate]);
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;
  const userId = profile?.id;

  useEffect(() => {
    if (!companyId || !userId) return;

    const listKey = queryKeys.notifications.list(companyId, userId);
    const unreadKey = queryKeys.notifications.unread(companyId, userId);
    const invalidateMessages = () => {
      void queryClient.invalidateQueries({ queryKey: listKey });
      void queryClient.invalidateQueries({ queryKey: unreadKey });
    };
    const channelId = `notifications:${userId}:${Math.random().toString(36).slice(2, 9)}`;
    const ricevute = new Set<string>();
    const alRitorno = () => {
      if (document.visibilityState === "visible") invalidateMessages();
    };
    document.addEventListener("visibilitychange", alRitorno);
    window.addEventListener("online", alRitorno);

    const channel = supabase
      .channel(channelId)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const newNotif = payload.new as Notification;
          if (newNotif.company_id !== companyId || newNotif.user_id !== userId || newNotif.is_dismissed) return;
          invalidateMessages();
          if (document.visibilityState !== "visible" || newNotif.is_read || ricevute.has(newNotif.id)) return;
          ricevute.add(newNotif.id);
          if (ricevute.size > 80) ricevute.delete(ricevute.values().next().value!);
          const route = percorsoNotifica(newNotif.action_url, window.location.origin, isNative);
          const destinazione = route && (trasformaLink ? trasformaLink(route) : route);

          toast(newNotif.title, {
            id: `notifica:${newNotif.id}`,
            description: newNotif.body ?? undefined,
            action: destinazione
              ? {
                  label: "Apri",
                  onClick: () => {
                    if (document.visibilityState === "visible") {
                      void supabase.from("notifications").update({ is_read: true })
                        .eq("id", newNotif.id).eq("company_id", companyId).eq("user_id", userId)
                        .then(invalidateMessages, invalidateMessages);
                    }
                    naviga.current(destinazione);
                  },
                }
              : undefined,
            duration: 5000,
          });
          playNotificationSound();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          if (payload.new.company_id === companyId) invalidateMessages();
        },
      );
    // 2026-05-27 (audit error handling): subscribeChannel logga e segnala se
    // la connessione realtime muore. Senza, l'utente vedeva la dashboard
    // "live" ma in realtà non riceveva più notifiche fino al prossimo
    // refresh manuale.
    subscribeChannel(channel, "notifications", {
      onDead: () => {
        // Refetch on dead channel as safety net (le notifiche dovrebbero
        // ancora arrivare al prossimo polling staleTime).
        invalidateMessages();
      },
    });

    return () => {
      document.removeEventListener("visibilitychange", alRitorno);
      window.removeEventListener("online", alRitorno);
      void supabase.removeChannel(channel);
    };
  }, [companyId, userId, queryClient, trasformaLink]);

  return null;
}

/**
 * Avvisi "di vita dell'azienda" (cash flow negativo, trial in scadenza,
 * inattività): stanno in lifecycle_notifications, tabella diversa e per
 * AZIENDA invece che per utente.
 *
 * Fino a ieri finivano in un banner fisso in cima a OGNI pagina: un muro
 * da scavalcare per arrivare al contenuto, ripetuto ovunque. Ora entrano
 * qui, cioè nella campanella in alto a destra col suo pallino rosso —
 * l'avviso si vede una volta e si legge quando si vuole.
 */
interface LifecycleRow {
  id: string;
  notification_type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

/** Prefisso che distingue un avviso lifecycle nelle liste unificate. */
const PREFISSO_LIFECYCLE = "lifecycle:";

/** Dove porta il click, quando la destinazione è certa. Niente rotte inventate. */
const LINK_PER_TIPO: Record<string, string> = {
  cash_flow_alert: "/azienda/previsionale",
};

/** "da 5 giorni" / "da ieri" / "da oggi": distingue il problema nuovo da quello che ti trascini. */
function daQuando(iso: string): string {
  const giorni = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (giorni <= 0) return "oggi";
  if (giorni === 1) return "ieri";
  return `${giorni} giorni`;
}

export function useNotifications(enabled = true, { elenco = true, avvisiAzienda = true } = {}) {
  const { profile, effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;
  const userId = profile?.id;
  const unreadKey = queryKeys.notifications.unread(companyId, userId);

  const listKey = queryKeys.notifications.list(companyId, userId);
  const list = useQuery<Notification[]>({
    queryKey: listKey,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, company_id, user_id, type, title, body, entity_type, entity_id, action_url, is_read, is_dismissed, created_at")
        .eq("company_id", companyId!)
        .eq("user_id", userId!)
        .eq("is_dismissed", false)
        .order("is_read", { ascending: true })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(50)
        .abortSignal(signal);
      if (error) throw error;
      return data as Notification[];
    },
    enabled: enabled && elenco && !!companyId && !!userId,
    // 2026-05-27: alzato da 30s a 2min — il realtime push tiene la cache
    // fresca, il polling era solo safety-net per eventi persi (raro).
    staleTime: 2 * 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: true,
  });

  const { data: notifications = [] } = list;
  const nonLette = useQuery({
    queryKey: unreadKey,
    queryFn: async ({ signal }) => {
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId!)
        .eq("user_id", userId!)
        .eq("is_dismissed", false)
        .eq("is_read", false)
        .abortSignal(signal);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: enabled && !!companyId && !!userId,
    staleTime: 2 * 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: true,
  });

  // ── Avvisi lifecycle (azienda) → stessa lista della campanella ──
  const { data: totaleNonLette } = nonLette;
  const lifecycle = useQuery<LifecycleRow[]>({
    queryKey: queryKeys.lifecycleNotifications.byCompany(companyId),
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from("lifecycle_notifications")
        .select("id, notification_type, title, message, is_read, created_at")
        .eq("company_id", companyId!)
        .eq("is_dismissed", false)
        .order("created_at", { ascending: false })
        .limit(50)
        .abortSignal(signal);
      if (error) throw error;
      return data as LifecycleRow[];
    },
    enabled: enabled && avvisiAzienda && !!companyId && !!userId,
    staleTime: 2 * 60_000,
    gcTime: 5 * 60_000,
  });

  /**
   * Una voce per TIPO, non per riga: il cron gira ogni giorno e cinque
   * giorni di cash flow negativo producevano cinque avvisi identici. Il
   * fatto è uno solo, e va detto una volta sola — con da quando lo si
   * sta dicendo.
   */
  const gruppiLifecycle = useMemo(() => {
    const perTipo = new Map<string, { rep: LifecycleRow; ids: string[]; dal: string }>();
    for (const r of (avvisiAzienda ? lifecycle.data ?? [] : [])) {
      const g = perTipo.get(r.notification_type);
      if (g) {
        g.ids.push(r.id);
        g.dal = r.created_at; // lista ordinata dal più recente: l'ultimo è il più vecchio
      } else {
        perTipo.set(r.notification_type, { rep: r, ids: [r.id], dal: r.created_at });
      }
    }
    return Array.from(perTipo.values());
  }, [avvisiAzienda, lifecycle.data]);

  /** Da id-con-prefisso al gruppo di righe che rappresenta. */
  const idsPerGruppo = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const g of gruppiLifecycle) m.set(`${PREFISSO_LIFECYCLE}${g.rep.id}`, g.ids);
    return m;
  }, [gruppiLifecycle]);

  const notificheUnificate = useMemo<Notification[]>(() => {
    const daLifecycle: Notification[] = gruppiLifecycle.map((g) => ({
      id: `${PREFISSO_LIFECYCLE}${g.rep.id}`,
      company_id: companyId ?? "",
      user_id: userId ?? "",
      type: "lifecycle",
      title: g.rep.title,
      body: g.ids.length > 1
        ? `${g.rep.message} · te lo segnaliamo da ${daQuando(g.dal)}`
        : g.rep.message,
      entity_type: null as null,
      entity_id: null as null,
      action_url: LINK_PER_TIPO[g.rep.notification_type] ?? null,
      // Un avviso azienda NON è un messaggio: è un problema aperto. Resta
      // "da gestire" (e quindi contato nel pallino rosso) finché non lo
      // chiudi tu o finché la causa non rientra — averlo guardato una volta
      // non lo risolve.
      is_read: false,
      is_dismissed: false,
      created_at: g.rep.created_at,
    }));
    return [...notifications, ...daLifecycle].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [notifications, gruppiLifecycle, companyId, userId]);

  /** Il numero sul pallino rosso: messaggi non letti + avvisi ancora aperti. */
  const visibleUnreadMessagesCount = notifications.filter((n) => !n.is_read).length;
  const unreadMessagesCount = totaleNonLette ?? visibleUnreadMessagesCount;
  const unreadCount = unreadMessagesCount + gruppiLifecycle.length;
  const tutteLeNonLetteVisibili = totaleNonLette !== undefined && totaleNonLette === visibleUnreadMessagesCount;
  const aggiornaMessaggi = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: listKey }),
    queryClient.invalidateQueries({ queryKey: unreadKey }),
  ]);

  const markAsRead = useMutation({
    mutationFn: async (id: string) => {
      // Gli avvisi azienda non si "leggono": restano finché non li chiudi.
      if (idsPerGruppo.has(id)) return;
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", id)
        .eq("company_id", companyId!)
        .eq("user_id", userId!);
      if (error) throw error;
    },
    onSuccess: (_, id) => {
      if (idsPerGruppo.has(id)) return;
      const prima = queryClient.getQueryData<Notification[]>(listKey)?.some(n => n.id === id && !n.is_read);
      queryClient.setQueryData<Notification[]>(
        listKey,
        old => old?.map(n => n.id === id ? { ...n, is_read: true } : n)
      );
      if (prima) queryClient.setQueryData<number>(unreadKey, n => n === undefined ? undefined : Math.max(0, n - 1));
    },
    onError: () => toast.error("Notifica ancora da leggere. Riprova."),
    onSettled: aggiornaMessaggi,
  });

  const markAllAsRead = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("mark_all_notifications_read", {
        p_company_id: companyId!,
      });
      if (error) throw error;
      // Gli avvisi azienda restano fuori: "letto" non è "risolto", e sparire
      // dal pallino al primo sguardo era esattamente il difetto del banner.
    },
    onSuccess: () => {
      queryClient.setQueryData<Notification[]>(
        listKey,
        old => old?.map(n => ({ ...n, is_read: true }))
      );
      queryClient.setQueryData(unreadKey, 0);
    },
    onError: () => {
      toast.error("Errore", { description: "Impossibile segnare tutte le notifiche come lette." });
    },
    onSettled: aggiornaMessaggi,
  });

  const dismiss = useMutation({
    mutationFn: async (id: string) => {
      const idsLifecycle = idsPerGruppo.get(id);
      if (idsLifecycle) {
        // Si chiude il GRUPPO: chiuderne una e vedersene comparire un'altra
        // identica sotto è peggio che non poterle chiudere affatto.
        const { error } = await supabase
          .from("lifecycle_notifications")
          .update({ is_dismissed: true })
          .eq("company_id", companyId!)
          .in("id", idsLifecycle);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from("notifications")
        .update({ is_dismissed: true })
        .eq("id", id)
        .eq("company_id", companyId!)
        .eq("user_id", userId!);
      if (error) throw error;
    },
    onSuccess: (_, id) => {
      const idsLifecycle = idsPerGruppo.get(id);
      if (idsLifecycle) {
        queryClient.setQueryData<LifecycleRow[]>(
          queryKeys.lifecycleNotifications.byCompany(companyId),
          old => old?.filter(r => !idsLifecycle.includes(r.id)),
        );
        return;
      }
      const prima = queryClient.getQueryData<Notification[]>(listKey)?.some(n => n.id === id && !n.is_read);
      queryClient.setQueryData<Notification[]>(listKey, old => old?.filter(n => n.id !== id));
      if (prima) queryClient.setQueryData<number>(unreadKey, n => n === undefined ? undefined : Math.max(0, n - 1));
    },
    onError: () => toast.error("Non riesco a chiudere la notifica. Riprova."),
    onSettled: aggiornaMessaggi,
  });

  return {
    notifications: notificheUnificate,
    unreadCount,
    unreadMessagesCount,
    tutteLeNonLetteVisibili,
    isLoading: list.isLoading || (avvisiAzienda && lifecycle.isLoading),
    isError: list.isError || (avvisiAzienda && lifecycle.isError),
    isRefreshing: list.isFetching || (avvisiAzienda && lifecycle.isFetching),
    isMarkingAll: markAllAsRead.isPending,
    refresh: () => Promise.all([list.refetch(), nonLette.refetch(), ...(avvisiAzienda ? [lifecycle.refetch()] : [])]),
    markAsRead: markAsRead.mutate,
    markAllAsRead: markAllAsRead.mutate,
    dismiss: dismiss.mutate,
  };
}
