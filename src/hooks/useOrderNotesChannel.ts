/**
 * useOrderNotesChannel — canale "Note interne di commessa"
 *
 * Riusa le tabelle Chat Team (internal_chat_*) per dare a ogni commessa un
 * thread collaborativo di note. Un canale è scopato a una commessa via
 * `order_id` (colonna nuova su internal_chat_channels).
 *
 * Le notifiche sono gestite SERVER-SIDE da un trigger DB su
 * internal_chat_messages: per i canali order, notifica ogni utente in
 * `mentions[]`. Il client NON crea notifiche — inserisce solo il messaggio
 * con `mentions` popolato.
 *
 * Nota: usiamo `(supabase as any)` per le tabelle internal_chat_* perché la
 * colonna nuova `order_id` non è ancora nei tipi generati (stesso pattern di
 * InternalChat.tsx).
 */
import { useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useCompanyStaffUsers } from "@/hooks/useCompanyStaffUsers";

// ─── Types ───────────────────────────────────────────────────────────────────
export interface OrderNotesChannel {
  id: string;
  company_id: string;
  order_id: string | null;
  name: string;
  type: string;
  created_by: string;
  is_private?: boolean | null;
  channel_emoji?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface OrderNoteMessage {
  id: string;
  channel_id: string;
  company_id: string;
  content: string;
  sender_id: string;
  mentions: string[] | null;
  created_at: string;
}

export interface OrderNotesTeamMember {
  id: string;
  label: string;
  first_name: string | null;
  last_name: string | null;
}

export interface OrderNotesProfile {
  first_name: string | null;
  last_name: string | null;
}

// Cast tipizzato minimale: le tabelle internal_chat_* con la nuova colonna
// order_id non sono nei tipi generati. Mirror del pattern in InternalChat.
const db = supabase as unknown as {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

function fullName(first?: string | null, last?: string | null): string {
  return `${first ?? ""} ${last ?? ""}`.trim();
}

export function useOrderNotesChannel(
  orderId: string | null | undefined,
  opts?: { orderCode?: string | null },
) {
  const { user, effectiveCompany } = useAuth();
  const userId = user?.id ?? null;
  const companyId = effectiveCompany?.id ?? null;
  const queryClient = useQueryClient();

  // ── Team members (per @mention + "contatta il team") ─────────────────────
  const { data: staffUsers = [] } = useCompanyStaffUsers(companyId, "all");
  const team: OrderNotesTeamMember[] = useMemo(
    () =>
      staffUsers.map((u) => ({
        id: u.id,
        label: fullName(u.first_name, u.last_name) || "Utente",
        first_name: u.first_name,
        last_name: u.last_name,
      })),
    [staffUsers],
  );

  const profilesById: Record<string, OrderNotesProfile> = useMemo(() => {
    const map: Record<string, OrderNotesProfile> = {};
    for (const u of team) {
      map[u.id] = { first_name: u.first_name, last_name: u.last_name };
    }
    return map;
  }, [team]);

  // ── Channel scopato alla commessa ────────────────────────────────────────
  const {
    data: channel = null,
    isLoading: channelLoading,
    isError: channelError,
    refetch: refetchChannel,
  } = useQuery({
    queryKey: ["order-notes-channel", orderId],
    enabled: !!orderId && !!companyId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<OrderNotesChannel | null> => {
      const { data, error } = await db
        .from("internal_chat_channels")
        .select("*")
        .eq("order_id", orderId)
        .eq("company_id", companyId)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as OrderNotesChannel | null) ?? null;
    },
  });

  const channelId = channel?.id ?? null;

  // ── Messages ─────────────────────────────────────────────────────────────
  const {
    data: messages = [],
    isLoading: messagesLoading,
    isError: messagesError,
    refetch: refetchMessages,
  } = useQuery({
    queryKey: ["order-notes-messages", channelId],
    enabled: !!channelId,
    queryFn: async (): Promise<OrderNoteMessage[]> => {
      const { data, error } = await db
        .from("internal_chat_messages")
        .select("*")
        .eq("channel_id", channelId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data as OrderNoteMessage[]) ?? [];
    },
  });

  // ── Members (ids) ────────────────────────────────────────────────────────
  const {
    data: memberIds = [],
    isError: membersError,
    refetch: refetchMembers,
  } = useQuery({
    queryKey: ["order-notes-members", channelId],
    enabled: !!channelId,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await db
        .from("internal_chat_members")
        .select("user_id")
        .eq("channel_id", channelId);
      if (error) throw error;
      return ((data as { user_id: string }[]) ?? []).map((m) => m.user_id);
    },
  });

  // ── Realtime: nuovi messaggi sul canale → invalida query messaggi ────────
  useEffect(() => {
    if (!channelId) return;
    const sub = supabase
      .channel(`chat-${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "internal_chat_messages",
          filter: `channel_id=eq.${channelId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["order-notes-messages", channelId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(sub);
    };
  }, [channelId, queryClient]);

  // ── Helper: garantisce l'esistenza del canale + owner membership ─────────
  const ensureChannel = async (): Promise<{ id: string; members: string[] }> => {
    if (!companyId || !userId || !orderId) {
      throw new Error("Sessione non valida: azienda o utente mancante.");
    }

    if (channel?.id) {
      return { id: channel.id, members: memberIds };
    }

    const name = `Commessa ${opts?.orderCode ?? ""}`.trim();
    const { data: created, error: createErr } = await db
      .from("internal_chat_channels")
      .insert({
        company_id: companyId,
        created_by: userId,
        type: "order",
        name,
        order_id: orderId,
        is_private: true,
        channel_emoji: "🏗️",
      })
      .select("id")
      .single();
    if (createErr) throw createErr;

    const newChannelId = created.id as string;

    const { error: ownerErr } = await db.from("internal_chat_members").insert({
      channel_id: newChannelId,
      company_id: companyId,
      user_id: userId,
      role: "owner",
    });
    if (ownerErr) {
      await db.from("internal_chat_channels").delete().eq("id", newChannelId);
      throw ownerErr;
    }

    return { id: newChannelId, members: [userId] };
  };

  // ── Helper: aggiunge come membri gli userId non ancora presenti ──────────
  const addMissingMembers = async (
    targetChannelId: string,
    currentMembers: string[],
    userIds: string[],
  ) => {
    if (!companyId) return;
    const existing = new Set(currentMembers);
    const toAdd = Array.from(new Set(userIds)).filter(
      (uid) => uid && !existing.has(uid),
    );
    if (toAdd.length === 0) return;
    const { error } = await db.from("internal_chat_members").insert(
      toAdd.map((uid) => ({
        channel_id: targetChannelId,
        company_id: companyId,
        user_id: uid,
        role: "member",
      })),
    );
    if (error) throw error;
  };

  const invalidateAll = (activeChannelId: string | null) => {
    queryClient.invalidateQueries({ queryKey: ["order-notes-channel", orderId] });
    queryClient.invalidateQueries({ queryKey: ["order-notes-messages", activeChannelId] });
    queryClient.invalidateQueries({ queryKey: ["order-notes-members", activeChannelId] });
  };

  // ── sendMessage ──────────────────────────────────────────────────────────
  const sendMutation = useMutation({
    mutationFn: async ({
      content,
      mentions = [],
    }: {
      content: string;
      mentions?: string[];
    }) => {
      if (!companyId || !userId) throw new Error("Sessione non valida.");
      const trimmed = content.trim();
      if (!trimmed) throw new Error("La nota è vuota.");

      const { id: activeId, members } = await ensureChannel();

      const cleanMentions = Array.from(new Set(mentions.filter(Boolean)));
      // Aggiungi come membri i menzionati non ancora presenti (escluso me).
      await addMissingMembers(
        activeId,
        members,
        cleanMentions.filter((m) => m !== userId),
      );

      const { error } = await db.from("internal_chat_messages").insert({
        channel_id: activeId,
        company_id: companyId,
        content: trimmed,
        sender_id: userId,
        mentions: cleanMentions.length > 0 ? cleanMentions : [],
      });
      if (error) throw error;

      return activeId;
    },
    onSuccess: (activeId) => invalidateAll(activeId),
    onError: (e: Error) => toast.error(e.message || "Impossibile inviare la nota."),
  });

  // ── contactTeam ──────────────────────────────────────────────────────────
  const contactMutation = useMutation({
    mutationFn: async (userIds: string[]) => {
      if (!companyId || !userId) throw new Error("Sessione non valida.");
      const clean = Array.from(new Set(userIds.filter(Boolean)));
      if (clean.length === 0) throw new Error("Seleziona almeno una persona.");

      const { id: activeId, members } = await ensureChannel();
      await addMissingMembers(
        activeId,
        members,
        clean.filter((m) => m !== userId),
      );

      const names = clean
        .map((uid) => {
          const p = profilesById[uid];
          return p ? fullName(p.first_name, p.last_name) || "Utente" : "Utente";
        })
        .filter(Boolean);

      const { error } = await db.from("internal_chat_messages").insert({
        channel_id: activeId,
        company_id: companyId,
        content: `Ho aggiunto al gruppo commessa: ${names.join(", ")}`,
        sender_id: userId,
        mentions: clean,
      });
      if (error) throw error;

      return activeId;
    },
    onSuccess: (activeId) => invalidateAll(activeId),
    onError: (e: Error) => toast.error(e.message || "Impossibile contattare il team."),
  });

  const refetch = () => {
    refetchChannel();
    refetchMessages();
    refetchMembers();
  };

  return {
    channel,
    messages,
    memberIds,
    team,
    profilesById,
    currentUserId: userId,
    isLoading: channelLoading || (!!channelId && messagesLoading),
    isError: channelError || messagesError || membersError,
    refetch,
    sendMessage: (args: { content: string; mentions?: string[] }) =>
      sendMutation.mutateAsync(args),
    contactTeam: (userIds: string[]) => contactMutation.mutateAsync(userIds),
    isSending: sendMutation.isPending,
    isContacting: contactMutation.isPending,
  };
}
