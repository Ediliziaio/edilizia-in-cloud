/**
 * InternalChat — WhatsApp-style team chat
 * Supports DMs, group chats, Silvio AI bot, reactions, replies, pins.
 *
 * v8.6.75 (LOOP-CHAT-ADMIN Round 9 / LUCIA-FULL-REMOVAL) — Lucia AI rimossa
 * completamente (constant LUCIA_SENDER_ID, mock profile, branch UI, render
 * legacy). I messaggi storici con sender Lucia (se presenti in DB) cadranno
 * nel rendering "Sconosciuto" — accettato dall'utente: "Lucia non deve
 * essere più".
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { ChatMarkdown, type ChatMarkdownSource } from "@/components/ui/ChatMarkdown";
import { AiMessageMetaTop, AiMessageMetaBottom, type AiMeta } from "@/components/silvio/AiMessageMeta";
import { SilvioRatingButtons } from "@/components/silvio/SilvioRatingButtons";
import { SILVIO_SKILLS, SILVIO_SKILL_CATEGORY_LABELS } from "@/lib/silvio-skills";
import { EmojiPicker } from "@/components/chat/EmojiPicker";
import { useAutoSizeTextarea } from "@/hooks/useAutoSizeTextarea";
import { AIModelSelector } from "@/components/ai/AIModelSelector";
import { AIRunFooter } from "@/components/ai/AIRunFooter";
import { useAIModelSelector } from "@/lib/ai/use-ai-model-selector";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, isToday, isYesterday, isSameDay } from "date-fns";
import { it } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
// Badge import rimosso (v8.6.75 Round 9 / LUCIA-FULL-REMOVAL) — era usato
// solo per il badge "AI" violet su header canale Lucia, ora eliminato.
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus, Send, Search, Users, MessageCircle, CornerDownRight, Bot, Brain, Sparkles, Loader2,
  Smile, X, Pin, PinOff, ArrowLeft, MoreVertical, UserPlus, UsersRound, CheckCheck, Megaphone,
  Paperclip, Mic, Trash2, AlertCircle, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  filterChatProfiles,
  isAllowedSilvioUpload,
  latestMessageByChannel,
  normalizeDmUserIds,
  parseStoredAttachmentUrl,
  toStoredAttachmentUrl,
} from "@/lib/internalChat";
// v8.6.75 (LOOP-CHAT-ADMIN Round 6 / SLATE-THEME) — Watermark logo rimosso
// (utente lo trovava ancora "che fa cagare"). Theme finale: slate-50 di base,
// bubble ricevuti slate-100, bubble miei verde WhatsApp-style. Compose bar
// blu uniforme per tutti i canali (Silvio + team), avatar/header Silvio
// restano arancio per identità AI.

// ─── Constants ───────────────────────────────────────────────────────────────
const QUICK_REACTIONS = ["👍", "❤️", "😂", "🙏", "👏", "🔥", "✅", "😮"];
// LUCIA_SENDER_ID rimosso (v8.6.75 Round 9). Eventuali messaggi storici
// con sender Lucia in DB verranno renderizzati come "Sconosciuto".
const SILVIO_SENDER_ID = "00000000-0000-0000-0000-000000000002";
// Silvio Superadmin: sender ID separato per distinguere i messaggi cross-tenant
// del co-founder AI da quelli del Silvio cliente
const SILVIO_ADMIN_SENDER_ID = "00000000-0000-0000-0000-000000000003";

// Avatar color palette for consistent user colors
const AVATAR_COLORS = [
  "bg-blue-500", "bg-green-500", "bg-orange-500", "bg-purple-500",
  "bg-pink-500", "bg-teal-500", "bg-indigo-500", "bg-rose-500",
  "bg-amber-500", "bg-cyan-500", "bg-emerald-500", "bg-violet-500",
];

function userColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ─── Types ───────────────────────────────────────────────────────────────────
interface Channel {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  type: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_system?: boolean | null;
  is_dm?: boolean | null;
  is_private?: boolean | null;
  channel_emoji?: string | null;
  dm_user_ids?: string[] | null;
}

interface ChannelMember {
  id: string;
  channel_id: string;
  user_id: string;
  role: string;
  last_read_at: string | null;
  // v8.6.51 — pin per-user. Migration 20270518100000.
  // Opzionale: pre-migration la colonna non esiste, fallback a false.
  is_pinned?: boolean | null;
}

interface Message {
  id: string;
  channel_id: string;
  sender_id: string;
  content: string;
  reply_to_id: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  is_edited: boolean;
  created_at: string;
  reactions?: Record<string, string[]> | null;
  message_type?: string;
  is_pinned?: boolean | null;
  // Sessione 1 — metadata AI (presenti solo per messaggi Silvio/Lucia)
  rag_sources?: ChatMarkdownSource[] | null;
  rag_min_similarity?: number | null;
  ai_confidence?: "high" | "medium" | "low" | null;
  ai_requires_human_review?: boolean | null;
  followup_suggestions?: string[] | null;
  council_data?: AiMeta["council_data"] | null;
  // AI Test Lab — run metadata (modello, costo, latenza)
  last_model_id?: string | null;
  last_provider?: string | null;
  last_cost_usd?: number | null;
  last_latency_ms?: number | null;
  last_input_tokens?: number | null;
  last_output_tokens?: number | null;
  last_generation_id?: string | null;
  requested_model_id?: string | null;
}

interface Profile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  avatar_url?: string | null;
}

interface RawProfile extends Profile {
  portal_disabled?: boolean | null;
}

type InternalChatProfilesRpc = {
  data: unknown;
  error: { message?: string } | null;
};

interface RpcProfile extends Profile {
  roles?: string[] | null;
}

interface FunctionErrorWithContext {
  message?: string;
  context?: unknown;
}

interface FunctionErrorBody {
  error?: string;
  message?: string;
}

interface FatturaOcrExtracted {
  numero_fattura?: string | null;
  data_fattura?: string | null;
  cedente?: {
    ragione_sociale?: string | null;
    piva?: string | null;
  } | null;
  imponibile_totale?: number | string | null;
  iva_totale?: number | string | null;
  totale_documento?: number | string | null;
  confidence?: number | string | null;
}

interface FatturaOcrResponse {
  extracted?: FatturaOcrExtracted | null;
}

interface TranscriptionResponse {
  text?: string | null;
}

type InternalChatMemberPinClient = {
  from(table: "internal_chat_members"): {
    update(values: { is_pinned: boolean }): {
      eq(column: string, value: string): {
        eq(column: string, value: string): Promise<{ error: { message?: string } | null }>;
      };
    };
  };
};

type InternalChatSidebarRpc = {
  data: unknown;
  error: { message?: string } | null;
};

type InternalChatSidebarRow = {
  channel_id?: string | null;
  last_message?: Message | null;
  unread_count?: number | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function renderWithMentions(text: string): React.ReactNode {
  const parts = text.split(/(@\w[\w\s]*)/g);
  return parts.map((part, i) =>
    part.startsWith("@") ? (
      <span key={i} className="text-blue-600 font-medium">{part}</span>
    ) : <span key={i}>{part}</span>
  );
}

function formatMsgTime(dateStr: string) {
  return format(new Date(dateStr), "HH:mm");
}

function formatChatListTime(dateStr: string) {
  const d = new Date(dateStr);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return "Ieri";
  return format(d, "dd/MM/yy");
}

function formatDateSeparator(dateStr: string) {
  const d = new Date(dateStr);
  if (isToday(d)) return "Oggi";
  if (isYesterday(d)) return "Ieri";
  return format(d, "d MMMM yyyy", { locale: it });
}

function initials(p: Profile | undefined) {
  if (!p) return "?";
  return `${p.first_name?.[0] || ""}${p.last_name?.[0] || ""}`.toUpperCase();
}

function profileName(p: Profile | undefined) {
  if (!p) return "Sconosciuto";
  const fullName = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
  return fullName || p.email || "Sconosciuto";
}

const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "application/zip",
]);

const ALLOWED_ATTACHMENT_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "txt",
  "zip",
]);

function isAllowedAttachment(file: File): boolean {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return ALLOWED_ATTACHMENT_MIME_TYPES.has(file.type) || ALLOWED_ATTACHMENT_EXTENSIONS.has(ext);
}

function safeAttachmentExtension(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
  return ALLOWED_ATTACHMENT_EXTENSIONS.has(ext) ? ext : "bin";
}

// ─── Data Hook ───────────────────────────────────────────────────────────────
/**
 * @param companyIdOverride - optional override per riuso dal lato Super Admin.
 *   I super admin non hanno `effectiveCompany`, ma possono usare il chat
 *   passando l'id della "platform admin company". Se omesso, fallback al
 *   normale flusso azienda (effectiveCompany?.id).
 */
function useInternalChat(companyIdOverride?: string) {
  const { user, profile: authProfile, effectiveCompany } = useAuth();
  const companyId = companyIdOverride ?? effectiveCompany?.id ?? authProfile?.company_id ?? null;
  const userId = user?.id;
  const queryClient = useQueryClient();

  const {
    data: myMemberships = [],
    isLoading: membershipsLoading,
    isError: membershipsError,
    refetch: refetchMemberships,
  } = useQuery({
    queryKey: ["internal-chat-my-memberships", companyId, userId],
    enabled: !!companyId && !!userId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("internal_chat_members")
        .select("*")
        .eq("company_id", companyId!)
        .eq("user_id", userId!);
      if (error) throw error;
      return data as ChannelMember[];
    },
  });

  const memberChannelIds = useMemo(
    () => Array.from(new Set(myMemberships.map((m) => m.channel_id).filter(Boolean))),
    [myMemberships],
  );

  const {
    data: channels = [],
    isLoading: channelsLoading,
    isError: channelsError,
    refetch: refetchChannels,
  } = useQuery({
    queryKey: ["internal-chat-channels", companyId, memberChannelIds],
    enabled: !!companyId && !!userId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    queryFn: async () => {
      if (memberChannelIds.length === 0) return [] as Channel[];
      const { data, error } = await supabase
        .from("internal_chat_channels").select("*")
        .eq("company_id", companyId!)
        .in("id", memberChannelIds)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as Channel[];
    },
  });

  const {
    data: members = [],
    // membersLoading non più usato — la chat renderizza senza aspettare members
    // (count partecipanti caricato pigramente, vedi commento isLoading sotto).
    isError: membersError,
    refetch: refetchMembers,
  } = useQuery({
    queryKey: ["internal-chat-members", companyId, memberChannelIds],
    enabled: !!companyId && !!userId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    queryFn: async () => {
      if (memberChannelIds.length === 0) return [] as ChannelMember[];
      // PERF (v8.6.75) — select chirurgico: prima `select("*")` ritornava
      // anche role, last_read_at, is_pinned, created_at, ecc. per ogni
      // riga × N canali × 8-10 membri = trasferimento bytes 5× superiore
      // al necessario. La logica usa SOLO channel_id + user_id (filtra "sono
      // membro", count partecipanti, lista membri canale selezionato).
      const { data, error } = await supabase
        .from("internal_chat_members")
        .select("id, channel_id, user_id")
        .eq("company_id", companyId!)
        .in("channel_id", memberChannelIds);
      if (error) throw error;
      return data as ChannelMember[];
    },
  });

  const {
    data: profiles = [],
    isLoading: profilesLoading,
    refetch: refetchProfiles,
  } = useQuery({
    queryKey: ["internal-chat-profiles", companyId, userId],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    queryFn: async () => {
      const rpc = supabase.rpc as unknown as (
        fn: string,
        args: Record<string, string>
      ) => Promise<InternalChatProfilesRpc>;
      const { data: rpcProfiles, error: rpcError } = await rpc.call(
        supabase,
        "get_internal_chat_profiles",
        { p_company_id: companyId! },
      );
      const rpcInternalProfiles: Profile[] = !rpcError && Array.isArray(rpcProfiles)
        ? (rpcProfiles as RpcProfile[])
            .filter((profile) => profile.id && (profile.first_name || profile.last_name || profile.email))
            .map(({ id, first_name, last_name, email, avatar_url }) => ({
              id,
              first_name,
              last_name,
              email,
              avatar_url,
            }))
        : [];

      if (rpcInternalProfiles.length > 0) {
        return Array.from(new Map(rpcInternalProfiles.map((profile) => [profile.id, profile])).values());
      }

      const [permissionsRes, employeesRes, subcontractorsRes] = await Promise.all([
        supabase.from("staff_permissions").select("user_id").eq("company_id", companyId!),
        supabase.from("employees").select("user_id").eq("company_id", companyId!).not("user_id", "is", null),
        supabase.from("subappaltatori").select("user_id").eq("company_id", companyId!).not("user_id", "is", null),
      ]);

      const internalIds = new Set<string>();
      if (userId) internalIds.add(userId);

      (permissionsRes.data || []).forEach((row) => row.user_id && internalIds.add(row.user_id));
      (employeesRes.data || []).forEach((row) => row.user_id && internalIds.add(row.user_id));
      (subcontractorsRes.data || []).forEach((row) => row.user_id && internalIds.add(row.user_id));

      if (internalIds.size === 0) return [];

      const { data: fallbackProfiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email, avatar_url, portal_disabled")
        .eq("company_id", companyId!)
        .in("id", Array.from(internalIds));
      if (profilesError) throw profilesError;

      return ((fallbackProfiles ?? []) as RawProfile[])
        .filter((profile) => profile.portal_disabled !== true)
        .map(({ portal_disabled: _portalDisabled, ...profile }) => profile);
    },
  });

  const internalProfileIds = useMemo(() => {
    return new Set(profiles.map((p) => p.id));
  }, [profiles]);

  const myChannels = channels.filter((ch) => {
    if (!members.some((m) => m.channel_id === ch.id && m.user_id === userId)) return false;
    if (ch.is_system) return true;
    if (profilesLoading) return true;

    const channelMemberIds = members
      .filter((m) => m.channel_id === ch.id)
      .map((m) => m.user_id);

    return channelMemberIds.length === 0 || channelMemberIds.every((id) => internalProfileIds.has(id));
  });

  // Last message per visible channel for preview — avoid loading non-member/private previews.
  // v8.6.50 — Fix bug sidebar non sincronizzata con la chat aperta:
  //   prima la query aveva staleTime 30s ma niente refetchInterval né
  //   realtime sub globale. Quando l'edge function silvio-chat inseriva il
  //   messaggio Silvio, la realtime sub specifica del canale (`chat-${id}`)
  //   invalidava ma per race condition / filtri RLS sull'INSERT da
  //   service_role talvolta non scattava → sidebar restava sul vecchio
  //   "last message" mentre il pane mostrava i nuovi messaggi.
  // Fix: refetchInterval 15s + realtime sub globale su `internal_chat_messages`
  //   (vedi useEffect sotto) → l'aggiornamento avviene sempre entro 15s anche
  //   se la realtime channel-specific fallisce.
  const channelIds = useMemo(() => myChannels.map((c) => c.id), [myChannels]);
  const channelIdsKey = useMemo(() => channelIds.join("|"), [channelIds]);
  const {
    data: sidebarState = { lastMessages: {}, unreadCounts: {} },
    refetch: refetchSidebarState,
  } = useQuery({
    queryKey: ["internal-chat-sidebar-state", companyId, userId, channelIds],
    enabled: !!companyId && channelIds.length > 0,
    queryFn: async () => {
      const visibleChannelIds = new Set(channelIds);
      const rpc = supabase.rpc as unknown as (
        fn: string,
        args: Record<string, string>
      ) => Promise<InternalChatSidebarRpc>;
      const { data: rpcRows, error: rpcError } = await rpc.call(
        supabase,
        "get_internal_chat_sidebar_state",
        { p_company_id: companyId!, p_user_id: userId! },
      );

      if (!rpcError && Array.isArray(rpcRows)) {
        const lastMessages: Record<string, Message> = {};
        const unreadCounts: Record<string, number> = {};

        for (const row of rpcRows as InternalChatSidebarRow[]) {
          if (!row.channel_id || !visibleChannelIds.has(row.channel_id)) continue;
          if (row.last_message) lastMessages[row.channel_id] = row.last_message;
          if ((row.unread_count ?? 0) > 0) unreadCounts[row.channel_id] = row.unread_count ?? 0;
        }

        return { lastMessages, unreadCounts };
      }

      const { data, error } = await supabase
        .from("internal_chat_messages")
        .select("*")
        .in("channel_id", channelIds)
        .order("created_at", { ascending: false })
        .limit(Math.max(channelIds.length * 8, 50));
      if (error) throw error;

      const unreadCounts: Record<string, number> = {};
      await Promise.all(myMemberships.map(async (m) => {
        if (!visibleChannelIds.has(m.channel_id)) return;
        let q = supabase
          .from("internal_chat_messages")
          .select("id", { count: "exact", head: true })
          .eq("channel_id", m.channel_id)
          .neq("sender_id", userId!);
        if (m.last_read_at) q = q.gt("created_at", m.last_read_at);
        const { count } = await q;
        if (count && count > 0) unreadCounts[m.channel_id] = count;
      }));

      return {
        lastMessages: latestMessageByChannel((data || []) as Message[]),
        unreadCounts,
      };
    },
    staleTime: 10_000,
    refetchInterval: 15_000, // safety net: 1 fetch ogni 15s se realtime fallisce
  });
  const lastMessages = sidebarState.lastMessages;
  const unreadCounts = sidebarState.unreadCounts;

  // v8.6.50 — Realtime sub globale (no filtro channel_id) per garantire che
  // la sidebar preview si aggiorni anche per i canali NON attivi (es. quando
  // Silvio in un canale di background risponde). La sub channel-specific in
  // useChannelMessages copre solo il canale aperto.
  // Le notifiche browser sono gestite a livello componente (vedi InternalChat
  // default export) per avere accesso a selectedChannelId/profileMap/handleSelect.
  useEffect(() => {
    if (!companyId || channelIds.length === 0) return;
    const sub = supabase
      .channel(`chat-list-${companyId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "internal_chat_messages",
          filter: `company_id=eq.${companyId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["internal-chat-sidebar-state"] });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [companyId, channelIds.length, channelIdsKey, queryClient]);

  const markChannelRead = useCallback(async (channelId: string) => {
    if (!userId) return;
    await supabase.from("internal_chat_members")
      .update({ last_read_at: new Date().toISOString() })
      .eq("channel_id", channelId).eq("user_id", userId);
    refetchSidebarState();
  }, [userId, refetchSidebarState]);

  return {
    channels: myChannels,
    allChannels: channels,
    members,
    profiles,
    companyId,
    userId,
    queryClient,
    unreadCounts,
    markChannelRead,
    refetchUnread: refetchSidebarState,
    lastMessages,
    myMemberships,
    internalProfileIds,
    // PERF (v8.6.75) — Non bloccare il render aspettando `members`:
    // members serve solo per il count "8 partecipanti" mostrato nelle righe
    // gruppo della sidebar. La query .in("channel_id", memberChannelIds) su
    // internal_chat_members può tornare 200-500 righe (50 canali × 8 membri)
    // ed è la più lenta del bundle iniziale. Renderiamo la chat appena
    // memberships + channels sono pronti → percezione velocità +3-5s su
    // aziende con molti canali. Il count membri compare quando arriva
    // (rendering condizionale già robusto a `members === []`).
    isLoading: membershipsLoading || channelsLoading,
    isError: membershipsError || channelsError || membersError,
    refetchChatData: () => {
      refetchMemberships();
      refetchChannels();
      refetchMembers();
      refetchProfiles();
    },
  };
}

// v8.6.75 (LOOP-CHAT-ADMIN Round 8 / FAST-OPEN) — Page size 80 → 5.
// Richiesta utente: "caricati gli ultimi 5 messaggi e se voglio vedere
// gli altri devono scrollare in alto ma non li carico subito così
// aumenta la velocità e risparmi tempo".
// Trade-off accettato: 5 è poco contesto su primo open ma per chat
// realtime (Silvio + team DM) di solito basta vedere l'ultimo scambio.
// Il pulsante "Carica messaggi precedenti" carica altri 5 alla volta.
const MESSAGES_PAGE_SIZE = 5;

type ChannelMessagesData = {
  items: Message[];
  hasOlder: boolean;
};

function useChannelMessages(channelId: string | null, onNewMessage?: () => void) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ["internal-chat-messages", channelId], [channelId]);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const { data, isError, refetch } = useQuery({
    queryKey,
    enabled: !!channelId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("internal_chat_messages").select("*")
        .eq("channel_id", channelId!)
        .order("created_at", { ascending: false })
        .limit(MESSAGES_PAGE_SIZE + 1);
      if (error) throw error;
      const rows = ((data ?? []) as Message[]);
      return {
        items: rows.slice(0, MESSAGES_PAGE_SIZE).reverse(),
        hasOlder: rows.length > MESSAGES_PAGE_SIZE,
      } satisfies ChannelMessagesData;
    },
    retry: 2,
  });

  const messages = useMemo(() => data?.items ?? [], [data?.items]);

  const loadOlder = useCallback(async () => {
    if (!channelId || isLoadingOlder || messages.length === 0 || data?.hasOlder === false) return;
    const oldest = messages[0];
    setIsLoadingOlder(true);
    try {
      const { data: olderRows, error } = await supabase
        .from("internal_chat_messages")
        .select("*")
        .eq("channel_id", channelId)
        .lt("created_at", oldest.created_at)
        .order("created_at", { ascending: false })
        .limit(MESSAGES_PAGE_SIZE + 1);
      if (error) throw error;

      const rows = ((olderRows ?? []) as Message[]);
      const olderItems = rows.slice(0, MESSAGES_PAGE_SIZE).reverse();
      queryClient.setQueryData<ChannelMessagesData>(queryKey, (current) => ({
        items: [...olderItems, ...(current?.items ?? [])],
        hasOlder: rows.length > MESSAGES_PAGE_SIZE,
      }));
    } catch (error) {
      toast.error("Non riesco a caricare i messaggi precedenti", {
        description: error instanceof Error ? error.message : "Errore sconosciuto",
      });
    } finally {
      setIsLoadingOlder(false);
    }
  }, [channelId, data?.hasOlder, isLoadingOlder, messages, queryClient, queryKey]);

  useEffect(() => {
    if (!channelId) return;
    const sub = supabase
      .channel(`chat-${channelId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public",
        table: "internal_chat_messages",
        filter: `channel_id=eq.${channelId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ["internal-chat-messages", channelId] });
        queryClient.invalidateQueries({ queryKey: ["internal-chat-sidebar-state"] });
        onNewMessage?.();
      })
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [channelId, queryClient, onNewMessage]);

  return { messages, isError, refetch, hasOlder: data?.hasOlder ?? false, loadOlder, isLoadingOlder };
}

// ─── Chat List Item ──────────────────────────────────────────────────────────
// v8.6.75 (LOOP-CHAT-ADMIN #9) — Memoizzato per evitare re-render della lista
// completa ad ogni typing/state-change nel pannello chat. La sidebar può avere
// 30-50 canali; senza memo il refresh sidebar (ogni 15s + ogni realtime) faceva
// ri-renderare tutte le righe. Con memo, solo le righe le cui props sono
// cambiate effettivamente (lastMsg, unread, isActive, isPinned) si aggiornano.
const ChatListItem = React.memo(function ChatListItem({
  channel, isActive, unread, lastMsg, profileMap, userId, members, onClick,
  isPinned, onTogglePin,
}: {
  channel: Channel; isActive: boolean; unread: number;
  lastMsg?: Message; profileMap: Map<string, Profile>;
  userId?: string; members: ChannelMember[]; onClick: () => void;
  // v8.6.51 — pin per-utente
  isPinned?: boolean;
  onTogglePin?: () => void;
}) {
  const channelNameLower = channel.name.toLowerCase();
  // Silvio cliente E Silvio Superadmin → stesso rendering visivo
  const isSilvio = channelNameLower === "silvio-ai" || channelNameLower === "silvio-admin";
  const isAI = isSilvio;
  const isDm = !!channel.is_dm;

  // For DM, show the other person's name and avatar
  const dmProfile = useMemo(() => {
    if (!isDm || !channel.dm_user_ids) return undefined;
    const otherId = channel.dm_user_ids.find((id) => id !== userId);
    return otherId ? profileMap.get(otherId) : undefined;
  }, [isDm, channel.dm_user_ids, userId, profileMap]);

  const displayName = isDm ? profileName(dmProfile) : channel.name;
  const memberCount = members.filter((m) => m.channel_id === channel.id).length;

  // Last message preview
  const lastMsgSender = lastMsg ? profileMap.get(lastMsg.sender_id) : undefined;
  const lastMsgPreview = lastMsg
    ? (
        lastMsg.sender_id === userId ? "Tu: "
        : lastMsg.sender_id === SILVIO_SENDER_ID ? "Silvio: "
        : lastMsg.sender_id === SILVIO_ADMIN_SENDER_ID ? "Silvio: "
        : `${lastMsgSender?.first_name ?? ""}: `
      )
      + lastMsg.content.slice(0, 50) + (lastMsg.content.length > 50 ? "…" : "")
    : isDm ? "Inizia a chattare" : "Nessun messaggio";

  // v8.6.54 — Cambiato da <button> a <div role=button> per evitare HTML
  // nesting illegale: il bottone pin/unpin DENTRO il button-listitem
  // causava warning React + crash potenziale "Cannot read properties of
  // undefined (reading 'length')" su hydration.
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Apri chat ${displayName}`}
      aria-pressed={isActive}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "w-full text-left px-3 py-3 flex items-center gap-3 transition-all border-b border-border/40 group/listitem relative cursor-pointer",
        isActive
          ? "bg-[#f0f2f5] dark:bg-white/10"
          : "hover:bg-[#f5f6f6] dark:hover:bg-white/5",
      )}
    >
      {/* Avatar */}
      <div className="relative shrink-0">
        {isSilvio ? (
          <div className="h-12 w-12 rounded-full bg-gradient-to-br from-orange-500 via-orange-500 to-amber-400 flex items-center justify-center ring-2 ring-orange-300/40 shadow-lg shadow-orange-300/30">
            <Brain className="h-6 w-6 text-white" strokeWidth={2.2} />
          </div>
        ) : isDm && dmProfile ? (
          <Avatar className="h-12 w-12">
            {dmProfile.avatar_url && <AvatarImage src={dmProfile.avatar_url} alt={profileName(dmProfile)} />}
            <AvatarFallback className={cn("text-white font-semibold text-sm", userColor(dmProfile.id))}>
              {initials(dmProfile)}
            </AvatarFallback>
          </Avatar>
        ) : (
          <div className="h-12 w-12 rounded-full bg-[#00a884] flex items-center justify-center">
            <UsersRound className="h-6 w-6 text-white" />
          </div>
        )}
        {/* Online dot for DMs */}
        {isDm && (
          <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full bg-green-500 border-2 border-white dark:border-gray-900" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={cn("text-[15px] truncate flex items-center gap-1.5", unread > 0 ? "font-semibold text-foreground" : "font-normal text-foreground")}>
            {/* v8.6.51 — Pin icon visibile sempre se pinnato */}
            {isPinned && (
              <Pin className="h-3 w-3 text-[#F97316] shrink-0" fill="currentColor" aria-label="Pinnata" />
            )}
            <span className="truncate">{displayName}</span>
          </span>
          <span className={cn("text-xs shrink-0", unread > 0 ? "text-[#00a884] font-medium" : "text-muted-foreground")}>
            {lastMsg ? formatChatListTime(lastMsg.created_at) : ""}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p className={cn("text-[13px] truncate", unread > 0 ? "text-foreground font-medium" : "text-muted-foreground")}>
            {lastMsg?.sender_id === userId && (
              <CheckCheck className="inline h-3.5 w-3.5 text-blue-500 mr-1 -mt-0.5" />
            )}
            {lastMsgPreview}
          </p>
          <div className="flex items-center gap-1.5 shrink-0">
            {/* v8.6.51 — Bottone pin: visibile on hover (group-hover), o sempre se già pinnato */}
            {onTogglePin && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onTogglePin(); }}
                className={cn(
                  "p-1 rounded hover:bg-foreground/10 transition-opacity",
                  isPinned ? "opacity-80 hover:opacity-100" : "opacity-0 group-hover/listitem:opacity-60 hover:!opacity-100",
                )}
                aria-label={isPinned ? "Rimuovi pin" : "Pinna chat"}
                title={isPinned ? "Rimuovi pin" : "Pinna chat in alto"}
              >
                <Pin className={cn("h-3.5 w-3.5", isPinned ? "text-[#F97316]" : "text-muted-foreground")} fill={isPinned ? "currentColor" : "none"} />
              </button>
            )}
            {!isDm && !isAI && (
              <span className="text-[10px] text-muted-foreground">
                <Users className="inline h-3 w-3 mr-0.5 -mt-0.5" />{memberCount}
              </span>
            )}
            {unread > 0 && (
              <span className="bg-[#25d366] text-white text-[11px] font-bold rounded-full min-w-[20px] h-[20px] flex items-center justify-center px-1.5">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}, (prev, next) => {
  // Custom equality: confrontiamo solo le prop semanticamente rilevanti +
  // reference della channel (stabile da react-query). Le callbacks (onClick,
  // onTogglePin) sono escluse: cambiano ad ogni render del parent come
  // closure inline ma il loro comportamento è invariante rispetto agli stati
  // che ci interessano (handleSelectChannel/toggleChannelPin sono useCallback
  // stabili nel parent). Skip safe perché qualsiasi cambio rilevante
  // (lastMsg, unread, isActive, isPinned) viene catturato dal confronto sotto.
  return (
    prev.channel === next.channel &&
    prev.isActive === next.isActive &&
    prev.unread === next.unread &&
    prev.lastMsg?.id === next.lastMsg?.id &&
    prev.lastMsg?.created_at === next.lastMsg?.created_at &&
    prev.lastMsg?.content === next.lastMsg?.content &&
    prev.isPinned === next.isPinned &&
    prev.profileMap === next.profileMap &&
    prev.userId === next.userId &&
    prev.members === next.members
  );
});

function AttachmentPreview({ msg, isMe }: { msg: Message; isMe: boolean }) {
  const storedAttachment = parseStoredAttachmentUrl(msg.attachment_url);
  const { data: signedUrl, isLoading } = useQuery({
    queryKey: ["internal-chat-attachment-url", msg.id, msg.attachment_url],
    enabled: !!storedAttachment,
    staleTime: 55 * 60 * 1000,
    queryFn: async () => {
      if (!storedAttachment) return null;
      const { data, error } = await supabase.storage
        .from(storedAttachment.bucket)
        .createSignedUrl(storedAttachment.path, 60 * 60);
      if (error) throw error;
      return data?.signedUrl ?? null;
    },
  });

  if (!msg.attachment_url) return null;

  const href = storedAttachment ? signedUrl : msg.attachment_url;
  const attachmentName = msg.attachment_name || "Allegato";
  const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(attachmentName);

  if (isImage && href) {
    return (
      <div className="mb-1.5">
        <a href={href} target="_blank" rel="noopener noreferrer" className="block" aria-label={`Apri allegato ${attachmentName}`}>
          <img loading="lazy"
            src={href}
            alt={attachmentName}
            className="rounded-lg max-w-full max-h-60 object-cover cursor-pointer hover:opacity-90 transition-opacity"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        </a>
      </div>
    );
  }

  return (
    <div className="mb-1.5">
      <a
        href={href ?? "#"}
        target={href ? "_blank" : undefined}
        rel="noopener noreferrer"
        aria-disabled={!href}
        aria-label={href ? `Apri allegato ${attachmentName}` : `Allegato ${attachmentName} in preparazione`}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] transition-colors",
          !href && "pointer-events-none opacity-70",
          isMe
            ? "bg-[#c8edca] dark:bg-[#004a3d] hover:bg-[#b8ddb9]"
            : "bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/15",
        )}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#54656f]" />
        ) : (
          <Paperclip className="h-4 w-4 shrink-0 text-[#54656f]" />
        )}
        <span className="truncate font-medium">{attachmentName}</span>
      </a>
    </div>
  );
}

// ─── Message Bubble ──────────────────────────────────────────────────────────
// v8.6.75 (LOOP-CHAT-ADMIN #9) — Memoizzato per evitare ri-render dell'intera
// conversazione ad ogni typing nel compose textarea. In chat con 200+ messaggi
// la differenza è netta: senza memo ogni keystroke ripercorre 200 nodi React;
// con memo solo i bubble le cui props sono cambiate (es. msg.reactions
// aggiornato) si renderizzano.
const MessageBubble = React.memo(function MessageBubble({
  msg, isMe, sender, showAvatar, replyMsg, profileMap,
  onReply, onPin, onReaction, onDelete, userId, onAskFollowup,
}: {
  msg: Message; isMe: boolean;
  sender: Profile | undefined; showAvatar: boolean;
  replyMsg: Message | null; profileMap: Map<string, Profile>;
  onReply: () => void; onPin: () => void; onDelete?: () => void;
  onReaction: (emoji: string) => void; userId?: string;
  onAskFollowup?: (query: string) => void;
}) {
  // Detect AI bot type from sender_id.
  // Silvio cliente e Silvio Superadmin sono visivamente IDENTICI (stesso "Silvio")
  // — la differenza vive solo nel sender_id (e nell'edge function chiamata).
  const isSilvioMsg = msg.sender_id === SILVIO_SENDER_ID;
  const isSilvioAdminMsg = msg.sender_id === SILVIO_ADMIN_SENDER_ID;
  // v8.6.75 (LUCIA-FULL-REMOVAL) — isLuciaMsg eliminato. isAIMsg ora copre
  // solo Silvio (cliente + admin). aiBotName sempre "Silvio ✨".
  const isAIMsg = isSilvioMsg || isSilvioAdminMsg;
  const aiBotName = "Silvio ✨";
  const replySender = replyMsg ? profileMap.get(replyMsg.sender_id) : undefined;

  return (
    <div className={cn("group flex mb-1", isMe ? "justify-end" : "justify-start", showAvatar && "mt-3")}>
      {/* Left avatar for others */}
      {!isMe && (
        <div className="w-8 shrink-0 self-end mr-1">
          {showAvatar && (
            (isSilvioMsg || isSilvioAdminMsg) ? (
              // Silvio (cliente o Admin): stesso avatar arancione — visivamente identico
              // La differenza vive solo nel sender_id e nell'edge function chiamata
              <div className="h-7 w-7 rounded-full bg-gradient-to-br from-orange-500 via-orange-500 to-amber-400 flex items-center justify-center ring-1 ring-orange-300/40 shadow-sm shadow-orange-300/30">
                <Brain className="h-3.5 w-3.5 text-white" strokeWidth={2.4} />
              </div>
            ) : isAIMsg ? (
              <div className="h-7 w-7 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                <Bot className="h-3.5 w-3.5 text-white" />
              </div>
            ) : (
              <Avatar className="h-7 w-7">
                {sender?.avatar_url && <AvatarImage src={sender.avatar_url} alt={profileName(sender)} />}
                <AvatarFallback className={cn("text-white text-[10px] font-semibold", userColor(msg.sender_id))}>
                  {initials(sender)}
                </AvatarFallback>
              </Avatar>
            )
          )}
        </div>
      )}

      <div className={cn("max-w-[75%] min-w-[80px] relative")}>
        {/* Bubble — v8.6.75 (LOOP-CHAT-ADMIN Round 9 / UNIFIED-BUBBLE +
            LUCIA-REMOVED). Pattern: bianco + border-l-4 colorato per
            identità del mittente.
              • isMe (sent) → verde #d9fdd3 (mio messaggio)
              • Silvio → border-l-4 ARANCIO (AI)
              • Altri ricevuti (team, DM, gruppi) → border-l-4 BLU
            Branch Lucia legacy violet rimosso. */}
        <div
          className={cn(
            "rounded-lg px-3 py-1.5 shadow-sm relative",
            isMe
              ? "bg-[#d9fdd3] dark:bg-[#005c4b] text-foreground rounded-tr-none"
              : (isSilvioMsg || isSilvioAdminMsg)
                ? "bg-white dark:bg-[#202c33] text-foreground border-l-4 border-l-orange-500 border-y border-r border-y-orange-100 border-r-orange-100 dark:border-orange-900/40 rounded-tl-none"
                : "bg-white dark:bg-[#202c33] text-foreground border-l-4 border-l-blue-500 border-y border-r border-y-blue-100 border-r-blue-100 dark:border-blue-900/40 rounded-tl-none",
          )}
        >
          {/* Sender name for group chats */}
          {showAvatar && !isMe && (
            <p className={cn(
              "text-[12px] font-semibold mb-0.5",
              (isSilvioMsg || isSilvioAdminMsg) ? "text-orange-600 dark:text-orange-400"
                : isAIMsg ? "text-violet-600 dark:text-violet-400"
                : `text-[${userColor(msg.sender_id).replace('bg-', '')}]`,
            )} style={{ color: isSilvioMsg || isSilvioAdminMsg || isAIMsg ? undefined : getColorHex(msg.sender_id) }}>
              {(isSilvioMsg || isSilvioAdminMsg) ? "Silvio" : isAIMsg ? aiBotName : profileName(sender)}
            </p>
          )}

          {/* Reply preview */}
          {replyMsg && (
            <div className={cn(
              "mb-1.5 px-2 py-1 rounded border-l-4 text-[12px]",
              isMe
                ? "bg-[#c8edca] dark:bg-[#004a3d] border-[#06cf9c]"
                : "bg-gray-100 dark:bg-white/5 border-gray-400",
            )}>
              <p className="font-semibold text-[11px]" style={{ color: getColorHex(replyMsg.sender_id) }}>
                {replyMsg.sender_id === userId ? "Tu" : profileName(replySender)}
              </p>
              <p className="truncate text-muted-foreground">{replyMsg.content.slice(0, 80)}</p>
            </div>
          )}

          {/* Pinned indicator */}
          {msg.is_pinned && (
            <div className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 mb-0.5">
              <Pin className="h-2.5 w-2.5" /> Pinnato
            </div>
          )}

          {/* Attachment */}
          {msg.attachment_url && (
            <AttachmentPreview msg={msg} isMe={isMe} />
          )}

          {/* AI metadata top: review banner + low confidence + multi-area badge */}
          {isAIMsg && (
            <AiMessageMetaTop
              meta={{
                ai_confidence: msg.ai_confidence,
                ai_requires_human_review: msg.ai_requires_human_review,
                followup_suggestions: msg.followup_suggestions,
                council_data: msg.council_data,
              }}
            />
          )}

          {/* Content */}
          {msg.content && !(msg.attachment_url && msg.content === `📎 ${msg.attachment_name}`) && (
            isAIMsg ? (
              // Silvio + Lucia + canale AI: render markdown completo (### → h3, **bold**, liste, tabelle, [S1] chip)
              <div className="text-[14px] break-words pr-14">
                <ChatMarkdown content={msg.content} sources={msg.rag_sources ?? undefined} />
              </div>
            ) : (
              <p className="text-[14px] whitespace-pre-wrap break-words pr-14 leading-relaxed">
                {renderWithMentions(msg.content)}
              </p>
            )
          )}

          {/* AI metadata bottom: council expandable + chip follow-up */}
          {isAIMsg && (
            <AiMessageMetaBottom
              meta={{
                ai_confidence: msg.ai_confidence,
                ai_requires_human_review: msg.ai_requires_human_review,
                followup_suggestions: msg.followup_suggestions,
                council_data: msg.council_data,
              }}
              onAskFollowup={onAskFollowup}
            />
          )}
          {/* AI Test Lab — footer ⏱ tempo · 🟠 modello · $costo (solo demo) */}
          {isAIMsg && msg.last_model_id && (
            <AIRunFooter
              meta={{
                model_id: msg.last_model_id,
                latency_ms: msg.last_latency_ms,
                cost_usd: msg.last_cost_usd,
                input_tokens: msg.last_input_tokens,
                output_tokens: msg.last_output_tokens,
                requested_model_id: msg.requested_model_id,
              }}
            />
          )}
          {/* Rating UI 👍/👎 — solo per messaggi Silvio Admin (super_admin feedback loop) */}
          {isSilvioAdminMsg && (
            <SilvioRatingButtons messageId={msg.id} />
          )}

          {/* Time + check marks */}
          <span className={cn(
            "absolute bottom-1 right-2 flex items-center gap-0.5 text-[11px]",
            isMe ? "text-[#667781] dark:text-gray-400" : "text-[#667781] dark:text-gray-500",
          )}>
            {msg.is_edited && <span className="italic mr-0.5">mod.</span>}
            {formatMsgTime(msg.created_at)}
            {isMe && <CheckCheck className="h-3.5 w-3.5 ml-0.5 text-blue-500" />}
          </span>
        </div>

        {/* Reactions */}
        {msg.reactions && Object.keys(msg.reactions).length > 0 && (
          <div className={cn("flex flex-wrap gap-1 mt-1", isMe ? "justify-end" : "justify-start")}>
            {Object.entries(msg.reactions).map(([emoji, users]) =>
                users.length > 0 ? (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => onReaction(emoji)}
                    aria-label={`Reazione ${emoji}, ${users.length} utenti`}
                    className={cn(
                    "flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full border shadow-sm",
                    users.includes(userId ?? "")
                      ? "bg-blue-50 border-blue-200 dark:bg-blue-900/30"
                      : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700",
                  )}
                >
                  <span>{emoji}</span>
                  <span className="font-medium text-[10px]">{users.length}</span>
                </button>
              ) : null
            )}
          </div>
        )}

        {/* Hover actions */}
        <div className={cn(
          "absolute -top-3 opacity-0 group-hover:opacity-100 transition-opacity z-10",
          isMe ? "left-0" : "right-0",
        )}>
          <div className="flex items-center gap-0.5 bg-white dark:bg-gray-800 rounded-lg shadow-md border px-1 py-0.5">
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700" title="Reagisci" aria-label="Reagisci al messaggio">
                  <Smile className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" align={isMe ? "start" : "end"} className="w-auto p-1.5">
                <div className="flex gap-1">
                  {QUICK_REACTIONS.map((emoji) => (
                    <button key={emoji} type="button" onClick={() => onReaction(emoji)} aria-label={`Reagisci con ${emoji}`}
                      className="text-lg hover:scale-125 transition-transform p-0.5 rounded">
                      {emoji}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <button type="button" onClick={onReply} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700" title="Rispondi" aria-label="Rispondi al messaggio">
              <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            <button type="button" onClick={onPin} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
              title={msg.is_pinned ? "Rimuovi pin" : "Pinna"} aria-label={msg.is_pinned ? "Rimuovi pin dal messaggio" : "Pinna messaggio"}>
              {msg.is_pinned
                ? <PinOff className="h-3.5 w-3.5 text-amber-500" />
                : <Pin className="h-3.5 w-3.5 text-muted-foreground" />}
            </button>
            {isMe && onDelete && (
              <button type="button" onClick={onDelete} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/40" title="Elimina messaggio" aria-label="Elimina messaggio">
                <Trash2 className="h-3.5 w-3.5 text-red-500" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}, (prev, next) => {
  // Custom equality: in chat con 200+ messaggi senza questo comparator ogni
  // keystroke nel compose ricreava 200 nuovi bubble (callbacks inline
  // diventano nuove ref → default shallow compare fallisce sempre).
  // Confrontiamo solo gli scalari + id delle entry referenziali (msg.id
  // stabile da react-query). Le callbacks (onReply/onPin/onReaction/
  // onDelete/onAskFollowup) sono escluse perché chiudono variabili stabili
  // (setReplyTo/toggleReaction/setMessageToDelete/sendToSilvio) e msg è la
  // stessa ref del bubble corrente → safe semanticamente.
  return (
    prev.msg === next.msg &&
    prev.isMe === next.isMe &&
    prev.showAvatar === next.showAvatar &&
    prev.replyMsg?.id === next.replyMsg?.id &&
    prev.sender?.id === next.sender?.id &&
    prev.sender?.avatar_url === next.sender?.avatar_url &&
    prev.userId === next.userId &&
    prev.profileMap === next.profileMap
  );
});

// Color hex helper for sender names
function getColorHex(userId: string): string {
  const colors = [
    "#1b74e4", "#16a34a", "#ea580c", "#7c3aed",
    "#db2777", "#0d9488", "#4f46e5", "#e11d48",
    "#d97706", "#0891b2", "#059669", "#7c3aed",
  ];
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

// ─── Main Component ──────────────────────────────────────────────────────────
interface InternalChatProps {
  /** Override del company_id usato per scope di canali/messaggi/profili.
   *  Permette il riuso lato Super Admin (passando platform_admin_company.id). */
  companyIdOverride?: string;
}

export default function InternalChat({ companyIdOverride }: InternalChatProps = {}) {
  const location = useLocation();
  const { role } = useAuth();
  const isCompanyAdmin = role === "company_admin" || role === "super_admin";
  const {
    channels, members, profiles, companyId, userId,
    queryClient, unreadCounts, markChannelRead, refetchUnread, lastMessages, myMemberships, internalProfileIds,
    isLoading: chatLoading, isError: chatDataError, refetchChatData,
  } = useInternalChat(companyIdOverride);

  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createDmOpen, setCreateDmOpen] = useState(false);
  const [newMsg, setNewMsg] = useState("");
  // Textarea auto-grow stile WhatsApp: cresce fino a 5 righe poi scrolla internamente
  const newMsgTextareaRef = useAutoSizeTextarea(newMsg, { maxRows: 5 });
  // AI Test Lab — selettore modello (visibile solo Demo Azienda + utente demo)
  const aiSelector = useAIModelSelector('silvio_chat', 'text');
  const [silvioSkillsOpen, setSilvioSkillsOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [aiTyping, setAiTyping] = useState(false);
  const [msgSearch, setMsgSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [chatFilter, setChatFilter] = useState<"all" | "groups" | "dm">("all");
  const [showMobile, setShowMobile] = useState(false); // mobile: show chat panel
  const [messageToDelete, setMessageToDelete] = useState<Message | null>(null);
  const [silvioError, setSilvioError] = useState<string | null>(null);
  const [lastSilvioPrompt, setLastSilvioPrompt] = useState<string | null>(null);
  const [slowChatLoad, setSlowChatLoad] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const presenceRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const selectedChannel = channels.find((c) => c.id === selectedChannelId);
  const isSilvioChannel = !!selectedChannel && selectedChannel.name.toLowerCase() === "silvio-ai";
  // Silvio Superadmin (admin team chat): edge function diversa, sender ID diverso
  const isSilvioAdminChannel = !!selectedChannel && selectedChannel.name.toLowerCase() === "silvio-admin";
  // v8.6.75 (LUCIA-FULL-REMOVAL) — isAIChannel ora copre solo Silvio.
  const isAIChannel = isSilvioChannel || isSilvioAdminChannel;
  const {
    messages,
    isError: messagesError,
    refetch: retryMessages,
    hasOlder,
    loadOlder,
    isLoadingOlder,
  } = useChannelMessages(selectedChannelId, refetchUnread);

  const profileMap = useMemo(() => {
    const m = new Map(profiles.map((p) => [p.id, p]));
    m.set(SILVIO_SENDER_ID, { id: SILVIO_SENDER_ID, first_name: "Silvio", last_name: "AI", email: "silvio@ediliziacloud.internal" });
    // Silvio Superadmin: stesso nome "Silvio" (visivamente identico al cliente)
    m.set(SILVIO_ADMIN_SENDER_ID, { id: SILVIO_ADMIN_SENDER_ID, first_name: "Silvio", last_name: "AI", email: "silvio-admin@ediliziacloud.internal" });
    return m;
  }, [profiles]);

  const channelMembers = useMemo(
    () => members.filter((m) => m.channel_id === selectedChannelId),
    [members, selectedChannelId],
  );

  useEffect(() => {
    if (!chatLoading) {
      setSlowChatLoad(false);
      return;
    }
    const timeout = window.setTimeout(() => setSlowChatLoad(true), 3500);
    return () => window.clearTimeout(timeout);
  }, [chatLoading]);

  // Channel selection
  const handleSelectChannel = useCallback((channelId: string) => {
    setSelectedChannelId(channelId);
    setReplyTo(null);
    setMsgSearch("");
    setShowSearch(false);
    setSilvioError(null);
    setShowMobile(true);
    markChannelRead(channelId);
  }, [markChannelRead]);

  // ─── Browser Notifications for incoming chat messages ──────────────
  // Trigger notifica nativa quando arriva un messaggio se:
  // - non è il mio messaggio
  // - tab non in focus OPPURE canale aperto diverso
  // Su mobile (PWA installata) usa la notifica nativa del SO.
  // Su desktop browser mostra notifica Chrome/Safari/Firefox standard.
  //
  // v8.6.75 (LOOP-CHAT-ADMIN #8) — PERF: prima la sub Realtime veniva
  // ricreata ad OGNI cambio di canale perché selectedChannelId e profileMap
  // erano nelle deps. Costo: unsubscribe + subscribe roundtrip Supabase ad
  // ogni navigazione fra chat. Ora usiamo ref per leggere il valore corrente
  // dentro il callback, mantenendo la sub stabile per tutta la durata del
  // mount (deps = [companyId, userId, handleSelectChannel] solo — tutte e
  // tre stabili nel ciclo di vita del componente).
  const selectedChannelIdRef = useRef(selectedChannelId);
  const profileMapRef = useRef(profileMap);
  useEffect(() => { selectedChannelIdRef.current = selectedChannelId; }, [selectedChannelId]);
  useEffect(() => { profileMapRef.current = profileMap; }, [profileMap]);

  useEffect(() => {
    if (!companyId || !userId) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const sub = supabase
      .channel(`chat-notify-${companyId}-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "internal_chat_messages",
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const msg = payload.new as any;
          if (!msg || msg.sender_id === userId) return;
          // Skip se sto leggendo questo canale ed il tab è in focus
          const channelOpen = msg.channel_id === selectedChannelIdRef.current;
          const tabFocused = !document.hidden;
          if (channelOpen && tabFocused) return;
          // Notifica solo se utente ha dato permesso
          if (Notification.permission !== "granted") return;
          // v8.6.75 (LOOP-CHAT-ADMIN #2) — BUG FIX: Profile non ha `full_name`,
          // ha first_name + last_name. Prima la notifica cadeva sempre sul
          // fallback `email` perché `?.full_name` era sempre undefined.
          // Ora usa profileName() che concatena correttamente.
          const senderProfile = profileMapRef.current.get(msg.sender_id);
          const senderName = senderProfile ? profileName(senderProfile) : "Nuovo messaggio";
          // v8.6.75 (LOOP-CHAT-ADMIN Round 2 / MORE-4) — Rimosso `msg.text`
          // dal fallback: la colonna non esiste sul tipo Message né sulla
          // tabella internal_chat_messages (campo è `content`). Lo lasciava
          // come dead-code che induceva in errore eventuali refactor futuri.
          const body = (msg.content ?? "").slice(0, 140) || "Hai ricevuto un messaggio";
          try {
            const n = new Notification(senderName, {
              body,
              icon: "/favicon.ico",
              tag: `chat-${msg.channel_id}`,
              renotify: true,
              silent: false,
            });
            n.onclick = () => {
              window.focus();
              if (msg.channel_id) handleSelectChannel(msg.channel_id);
              n.close();
            };
          } catch {
            // Silent fail se Notification non disponibile (iOS Safari < 16.4)
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [companyId, userId, handleSelectChannel]);

  // Richiedi permission browser notifications dopo che l'utente è entrato
  // nella chat (non al primo load).
  // v8.6.75 (LOOP-CHAT-ADMIN #7) — Defer di 8s: richiedere il permesso
  // appena la pagina monta è un anti-pattern Chrome (l'utente non sa cosa
  // sta autorizzando, alta probabilità di "Block" permanente → mai più
  // notifiche). Aspettare 8s significa: l'utente ha visto cosa è la pagina
  // chat → sa che il prompt riguarda i messaggi → consenso informato.
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "default") return;
    const timer = window.setTimeout(() => {
      void Notification.requestPermission().catch(() => { /* silent */ });
    }, 8000);
    return () => window.clearTimeout(timer);
  }, []);

  // Deep-link via ?channel=<id|name>: reagisce ai cambi URL (es. click su
  // "Apri chat con Silvio" dal bell popover quando si è già sulla pagina chat).
  useEffect(() => {
    if (channels.length === 0) return;
    const params = new URLSearchParams(location.search);
    const targetChannel = params.get("channel");
    if (!targetChannel) return;
    const found = channels.find((c) => c.id === targetChannel || c.name === targetChannel);
    if (found && found.id !== selectedChannelId) {
      handleSelectChannel(found.id);
    }
  }, [location.search, channels, selectedChannelId, handleSelectChannel]);

  // Auto-select primo canale al primo render (desktop), solo se non c'è
  // un deep-link e nessun canale già selezionato.
  useEffect(() => {
    if (selectedChannelId || channels.length === 0) return;
    const params = new URLSearchParams(location.search);
    if (params.get("channel")) return; // gestito dall'effect sopra
    if (window.innerWidth >= 768) {
      handleSelectChannel(channels[0].id);
    }
  }, [channels, selectedChannelId, handleSelectChannel, location.search]);

  // v8.6.75 (LOOP-CHAT-ADMIN Round 8 / FAST-OPEN) — Smart-scroll v2.
  //
  // PROBLEMA precedente: il useEffect dipendeva da `messages.length` +
  // `selectedChannelId`. Al cambio canale:
  //   1) selectedChannelId cambia → channelChanged=true → instant scroll
  //      MA messages.length=0 (loading) → niente da scrollare
  //   2) messages arrivano (length: 0 → 5) → channelChanged=false (ref
  //      già aggiornato) → vai sul ramo "wasAtBottomRef" → SMOOTH scroll
  //   → UX percepita: la chat si apre vuota, poi i messaggi appaiono
  //      in alto, poi animazione scroll smooth verso il basso.
  //
  // FIX: tracciamo un Set di canali su cui il primo scroll è già stato
  // fatto. Quando si apre un canale: primo scroll = INSTANT (auto)
  // appena i messaggi compaiono. Successivi cambi length sullo stesso
  // canale = SMOOTH solo se utente era già in fondo (vecchio comportamento).
  const wasAtBottomRef = useRef(true);
  const lastChannelIdRef = useRef<string | null>(null);
  const initialScrollDoneRef = useRef<Set<string>>(new Set());
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  // Threshold: considerato "at bottom" se a meno di 80px dal fondo
  const AT_BOTTOM_THRESHOLD = 80;

  useEffect(() => {
    if (!selectedChannelId) return;
    const channelChanged = lastChannelIdRef.current !== selectedChannelId;
    if (channelChanged) {
      // Cambio canale: resetta il flag di primo-scroll per il NUOVO canale
      // (l'utente potrebbe rientrare in un canale già aperto in precedenza).
      initialScrollDoneRef.current.delete(selectedChannelId);
      lastChannelIdRef.current = selectedChannelId;
    }

    // Primo scroll dopo cambio canale: aspettiamo che messages.length > 0
    // (i dati siano arrivati dal DB) e facciamo scroll INSTANT al bottom.
    const needsInitialScroll =
      !initialScrollDoneRef.current.has(selectedChannelId) &&
      messages.length > 0;
    if (needsInitialScroll) {
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
        wasAtBottomRef.current = true;
        initialScrollDoneRef.current.add(selectedChannelId);
      });
      return;
    }

    // Smart scroll su nuovo messaggio arrivato nello stesso canale:
    // smooth SOLO se l'utente era già al bottom (non disturba se sta
    // leggendo messaggi più in alto).
    if (wasAtBottomRef.current && !channelChanged) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length, selectedChannelId]);

  // Tracking "wasAtBottom" per lo smart-scroll; la paginazione manuale dei
  // messaggi più vecchi è gestita da useChannelMessages.
  const onMessagesScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    wasAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= AT_BOTTOM_THRESHOLD;
  }, []);

  // Typing presence
  useEffect(() => {
    if (!selectedChannelId || !userId) return;
    const ch = supabase.channel(`typing-${selectedChannelId}`, {
      config: { presence: { key: userId } },
    });
    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState<{ typing: boolean; name: string }>();
      const typers = Object.entries(state)
        .filter(([uid, data]) => uid !== userId && (data as Array<{ typing: boolean; name: string }>)[0]?.typing)
        .map(([, data]) => (data as Array<{ typing: boolean; name: string }>)[0]?.name ?? "Qualcuno");
      setTypingUsers(typers);
    }).subscribe();
    presenceRef.current = ch;
    return () => { supabase.removeChannel(ch); setTypingUsers([]); };
  }, [selectedChannelId, userId]);

  const broadcastTyping = useCallback(() => {
    if (!presenceRef.current || !userId) return;
    const profile = profiles.find((p) => p.id === userId);
    presenceRef.current.track({ typing: true, name: profile?.first_name ?? "Qualcuno" });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      presenceRef.current?.track({ typing: false, name: "" });
    }, 3000);
  }, [userId, profiles]);

  const parseMentions = useCallback((content: string): string[] => {
    const mentionRegex = /@([\w]+(?:\s+[\w]+)?)/g;
    const mentioned: string[] = [];
    let match;
    while ((match = mentionRegex.exec(content)) !== null) {
      const nameQuery = match[1].toLowerCase();
      for (const p of profiles) {
        const fullName = `${p.first_name} ${p.last_name}`.toLowerCase();
        if (fullName.startsWith(nameQuery) || p.first_name.toLowerCase() === nameQuery) {
          if (!mentioned.includes(p.id)) mentioned.push(p.id);
        }
      }
    }
    return mentioned;
  }, [profiles]);

  // Send message
  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!selectedChannelId || !companyId || !userId || !newMsg.trim()) return;
      if (!channels.some((channel) => channel.id === selectedChannelId)) {
        throw new Error("Non hai accesso a questa conversazione.");
      }
      const mentionedIds = parseMentions(newMsg.trim());
      const { error } = await supabase.from("internal_chat_messages").insert({
        channel_id: selectedChannelId, sender_id: userId, company_id: companyId,
        content: newMsg.trim(), reply_to_id: replyTo?.id || null,
        mentions: mentionedIds.length > 0 ? mentionedIds : null,
      });
      if (error) throw error;
      await supabase.from("internal_chat_channels").update({ updated_at: new Date().toISOString() }).eq("id", selectedChannelId);
      await supabase.from("internal_chat_members").update({ last_read_at: new Date().toISOString() }).eq("channel_id", selectedChannelId).eq("user_id", userId);
    },
    onSuccess: () => {
      setNewMsg(""); setReplyTo(null);
      queryClient.invalidateQueries({ queryKey: ["internal-chat-messages", selectedChannelId] });
      queryClient.invalidateQueries({ queryKey: ["internal-chat-channels"] });
      queryClient.invalidateQueries({ queryKey: ["internal-chat-sidebar-state"] });
      refetchUnread();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Lucia AI rimossa (v8.6.75 Round 9). Solo Silvio resta come bot AI.

  // Send to Silvio (meta-persona orchestrator)
  const sendToSilvio = useCallback(async (messageText: string) => {
    if (!selectedChannelId || !companyId || !userId || !messageText.trim()) return;
    if (!channels.some((channel) => channel.id === selectedChannelId)) {
      toast.error("Non hai accesso a questa conversazione.");
      return;
    }
    setSilvioError(null);
    setLastSilvioPrompt(messageText.trim());
    // 1) Inserisci subito il messaggio dell'utente nel canale (UX feedback istantaneo)
    const { error: insertErr } = await supabase.from("internal_chat_messages").insert({
      channel_id: selectedChannelId, sender_id: userId, company_id: companyId,
      content: messageText.trim(), message_type: "text",
    });
    if (insertErr) {
      toast.error(`Errore invio: ${insertErr.message || insertErr.details || insertErr.hint || "errore sconosciuto"}`);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["internal-chat-messages", selectedChannelId] });
    queryClient.invalidateQueries({ queryKey: ["internal-chat-sidebar-state"] });
    await supabase.from("internal_chat_channels").update({ updated_at: new Date().toISOString() }).eq("id", selectedChannelId);
    await supabase.from("internal_chat_members").update({ last_read_at: new Date().toISOString() }).eq("channel_id", selectedChannelId).eq("user_id", userId);
    setAiTyping(true);
    try {
      // Routing edge function: canale silvio-admin → silvio-admin-chat (cross-tenant
      // tools per super_admin), altrimenti silvio-chat (assistente cliente).
      const edgeFn = isSilvioAdminChannel ? "silvio-admin-chat" : "silvio-chat";
      const res = await supabase.functions.invoke(edgeFn, {
        body: {
          channel_id: selectedChannelId,
          message: messageText.trim(),
          // AI Test Lab — passa il modello selezionato SOLO se demo (server gating).
          ...(aiSelector.showSelector ? { model: aiSelector.selectedModel } : {}),
        },
      });
      if (res.error) {
        let errBody: FunctionErrorBody | null = null;
        const ctx = (res.error as FunctionErrorWithContext).context;
        try {
          if (ctx instanceof Response) errBody = (await ctx.json()) as FunctionErrorBody;
        } catch {
          errBody = null;
        }
        throw new Error(errBody?.error ?? errBody?.message ?? res.error.message ?? "Errore Silvio");
      }
      // AI Test Lab — toast warning se aiRouter ha fatto fallback automatico.
      // Funziona anche senza migration AI_TEST_LAB-2 (legge da response, non DB).
      if (aiSelector.showSelector && aiSelector.selectedModel) {
        const data = res.data as {
          model_used?: string;
          failed_attempts?: Array<{ model: string; error: string }>;
        } | null;
        const usato = data?.model_used;
        if (usato && usato !== aiSelector.selectedModel) {
          const richiestoLabel = aiSelector.selectedModel.split('/').pop() ?? aiSelector.selectedModel;
          const usatoLabel = usato.split('/').pop() ?? usato;
          const failedAttempt = data?.failed_attempts?.find(
            (a) => a.model === aiSelector.selectedModel,
          );
          const reason = failedAttempt?.error
            ? ` — ${failedAttempt.error.slice(0, 100)}`
            : '';
          toast.warning(
            `⚠️ Fallback automatico: ${richiestoLabel} non disponibile, risposta da ${usatoLabel}${reason}`,
            { duration: 9000 },
          );
        }
      }
      queryClient.invalidateQueries({ queryKey: ["internal-chat-messages", selectedChannelId] });
      queryClient.invalidateQueries({ queryKey: ["internal-chat-sidebar-state"] });
      refetchUnread();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Errore comunicazione";
      setSilvioError(message);
      toast.error(`Silvio: ${message}`);
    } finally {
      setAiTyping(false);
    }
  }, [selectedChannelId, companyId, userId, channels, queryClient, refetchUnread, isSilvioAdminChannel, aiSelector.showSelector, aiSelector.selectedModel]);

  // Create group channel
  const [channelName, setChannelName] = useState("");
  const [channelDesc, setChannelDesc] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [memberDialogSearch, setMemberDialogSearch] = useState("");
  const [dmDialogSearch, setDmDialogSearch] = useState("");

  const createChannelMutation = useMutation({
    mutationFn: async () => {
      if (!companyId || !userId) return;
      const safeChannelName = channelName.trim();
      if (!safeChannelName) throw new Error("Inserisci un nome gruppo.");
      const safeSelectedMembers = Array.from(new Set(selectedMembers.filter((id) => internalProfileIds.has(id))));
      const { data: ch, error } = await supabase.from("internal_chat_channels").insert({
        company_id: companyId, name: safeChannelName,
        description: channelDesc.trim() || null, type: "group", created_by: userId,
      }).select().single();
      if (error) throw error;
      const allMemberIds = [userId, ...safeSelectedMembers.filter((id) => id !== userId)];
      const { error: mErr } = await supabase.from("internal_chat_members").insert(
        allMemberIds.map((uid) => ({
          channel_id: ch.id, user_id: uid, company_id: companyId,
          role: uid === userId ? "admin" : "member",
        }))
      );
      if (mErr) {
        await supabase.from("internal_chat_channels").delete().eq("id", ch.id);
        throw mErr;
      }
      return ch.id;
    },
    onSuccess: (newId) => {
      queryClient.invalidateQueries({ queryKey: ["internal-chat-channels"] });
      queryClient.invalidateQueries({ queryKey: ["internal-chat-members"] });
      queryClient.invalidateQueries({ queryKey: ["internal-chat-my-memberships"] });
      queryClient.invalidateQueries({ queryKey: ["internal-chat-sidebar-state"] });
      setCreateOpen(false); setChannelName(""); setChannelDesc(""); setSelectedMembers([]); setMemberDialogSearch("");
      if (newId) handleSelectChannel(newId);
      toast.success("Gruppo creato!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Create DM
  const createDm = useCallback(async (targetUserId: string) => {
    if (!companyId || !userId) return;
    if (!internalProfileIds.has(targetUserId)) {
      toast.error("Puoi avviare chat solo con persone interne all'azienda.");
      return;
    }
    const dmUserIds = normalizeDmUserIds(userId, targetUserId);
    // Check if DM already exists
    const existing = channels.find((ch) =>
      ch.is_dm && ch.dm_user_ids &&
      normalizeDmUserIds(ch.dm_user_ids[0] ?? "", ch.dm_user_ids[1] ?? "").join("|") === dmUserIds.join("|")
    );
    if (existing) {
      handleSelectChannel(existing.id);
      setCreateDmOpen(false);
      setDmDialogSearch("");
      return;
    }
    const { data: existingRows } = await supabase
      .from("internal_chat_channels")
      .select("*")
      .eq("company_id", companyId)
      .eq("is_dm", true)
      .contains("dm_user_ids", dmUserIds)
      .limit(1);
    const existingFromDb = ((existingRows ?? []) as Channel[])[0];
    if (existingFromDb) {
      queryClient.invalidateQueries({ queryKey: ["internal-chat-channels"] });
      queryClient.invalidateQueries({ queryKey: ["internal-chat-members"] });
      queryClient.invalidateQueries({ queryKey: ["internal-chat-my-memberships"] });
      handleSelectChannel(existingFromDb.id);
      setCreateDmOpen(false);
      setDmDialogSearch("");
      return;
    }
    const target = profileMap.get(targetUserId);
    const me = profileMap.get(userId);
    const dmName = `${me?.first_name ?? ""} & ${target?.first_name ?? ""}`;
    const { data: ch, error } = await supabase.from("internal_chat_channels").insert({
      company_id: companyId, name: dmName, type: "dm", created_by: userId,
      is_dm: true, dm_user_ids: dmUserIds,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    const { error: membersError } = await supabase.from("internal_chat_members").insert([
      { channel_id: ch.id, user_id: userId, company_id: companyId, role: "member" },
      { channel_id: ch.id, user_id: targetUserId, company_id: companyId, role: "member" },
    ]);
    if (membersError) {
      await supabase.from("internal_chat_channels").delete().eq("id", ch.id);
      toast.error(membersError.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["internal-chat-channels"] });
    queryClient.invalidateQueries({ queryKey: ["internal-chat-members"] });
    queryClient.invalidateQueries({ queryKey: ["internal-chat-my-memberships"] });
    queryClient.invalidateQueries({ queryKey: ["internal-chat-sidebar-state"] });
    handleSelectChannel(ch.id);
    setCreateDmOpen(false);
    setDmDialogSearch("");
    toast.success("Chat creata!");
  }, [companyId, userId, channels, profileMap, queryClient, handleSelectChannel, internalProfileIds]);

  // ── File Attachment ──
  const attachInputRef = useRef<HTMLInputElement>(null);
  const [isAttaching, setIsAttaching] = useState(false);

  // ─── Silvio prefill from sessionStorage (cross-page redirect with prompt) ───
  useEffect(() => {
    if ((!isSilvioChannel && !isSilvioAdminChannel) || !selectedChannelId) return;
    let prefill = "";
    try { prefill = sessionStorage.getItem("silvio_prefill_message") ?? ""; } catch { /* ignore */ }
    if (prefill && prefill.length > 5) {
      try { sessionStorage.removeItem("silvio_prefill_message"); } catch { /* ignore */ }
      // Auto-send dopo il selectedChannelId è attivo
      setTimeout(() => sendToSilvio(prefill), 500);
    }
  }, [isSilvioChannel, isSilvioAdminChannel, selectedChannelId, sendToSilvio]);

  // ─── Auto-select Silvio channel su navigazione con prefill ───
  useEffect(() => {
    if (selectedChannelId) return;
    let prefill = "";
    try { prefill = sessionStorage.getItem("silvio_prefill_message") ?? ""; } catch { /* ignore */ }
    if (!prefill) return;
    const silvioCh = channels.find((c) => c.name === "silvio-ai" && c.is_dm);
    if (silvioCh) handleSelectChannel(silvioCh.id);
  }, [selectedChannelId, channels, handleSelectChannel]);

  // ─── Silvio image upload (vision) ──────────────────────────────────────
  const silvioImageInputRef = useRef<HTMLInputElement>(null);
  const [silvioUploading, setSilvioUploading] = useState(false);

  const uploadAndAskSilvio = useCallback(async (file: File) => {
    if (!isSilvioChannel || !companyId || !userId) {
      toast.error("Disponibile solo nella chat Silvio");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error("File troppo grande (max 20 MB)");
      return;
    }
    if (!isAllowedSilvioUpload(file)) {
      toast.error("Silvio accetta solo immagini JPG/PNG/GIF/WebP o PDF.");
      return;
    }
    setSilvioUploading(true);
    try {
      // 1) Upload to silvio-uploads bucket
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
      const path = `${userId}/silvio_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("silvio-uploads").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });
      if (upErr) throw upErr;

      // 2) Detect if it's a fattura (PDF or specific filename hint)
      const isPdf = file.type === "application/pdf" || ext === "pdf";
      const looksFattura = /fattur|invoice|ricevuta/i.test(file.name);

      if (isPdf || looksFattura) {
        // Branch: OCR fattura with confirmation
        const { data, error } = await supabase.functions.invoke("ai-fattura-ricevuta-ocr", {
          body: { storage_path: path, bucket: "silvio-uploads", auto_create: false },
        });
        if (error) throw new Error(error.message);
        const ext = (data as FatturaOcrResponse | null)?.extracted ?? {};
        const summary = `📄 **Fattura OCR completato**

- **Numero**: ${ext.numero_fattura ?? "—"}
- **Data**: ${ext.data_fattura ?? "—"}
- **Cedente**: ${ext.cedente?.ragione_sociale ?? "—"} (P.IVA ${ext.cedente?.piva ?? "—"})
- **Imponibile**: € ${Number(ext.imponibile_totale ?? 0).toLocaleString("it-IT", {minimumFractionDigits: 2})}
- **IVA**: € ${Number(ext.iva_totale ?? 0).toLocaleString("it-IT", {minimumFractionDigits: 2})}
- **Totale**: € ${Number(ext.totale_documento ?? 0).toLocaleString("it-IT", {minimumFractionDigits: 2})}
- Confidence: ${ext.confidence ?? "—"}

Vuoi che la salvi nelle fatture ricevute? Rispondi "salva fattura" e procedo.`;
        // Post user message + OCR result
        await supabase.from("internal_chat_messages").insert({
          channel_id: selectedChannelId, sender_id: userId, company_id: companyId,
          content: `📎 Caricata fattura: ${file.name}`,
          message_type: "text",
        });
        await supabase.from("internal_chat_messages").insert({
          channel_id: selectedChannelId, sender_id: SILVIO_SENDER_ID, company_id: companyId,
          content: summary, message_type: "text",
        });
        queryClient.invalidateQueries({ queryKey: ["internal-chat-messages", selectedChannelId] });
      } else {
        // Branch: ask Silvio with the image
        const { data: urlData } = await supabase.storage.from("silvio-uploads").createSignedUrl(path, 600);
        const signedUrl = urlData?.signedUrl;
        const userPrompt = `Ho caricato un'immagine. Analizzala con il tool analyze_image (storage_path: ${path}). Dimmi cosa vedi: per cantieri analizza sicurezza+avanzamento, per documenti estrai dati.`;
        await supabase.from("internal_chat_messages").insert({
          channel_id: selectedChannelId, sender_id: userId, company_id: companyId,
          content: `📎 Allegato: ${file.name}\n${signedUrl ? `[Anteprima](${signedUrl})` : ""}`,
          message_type: "text",
        });
        await sendToSilvio(userPrompt);
      }
    } catch (e) {
      toast.error(`Upload fallito: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSilvioUploading(false);
    }
  }, [isSilvioChannel, companyId, userId, selectedChannelId, queryClient, sendToSilvio]);

  // ─── Audio Recording (Silvio AI) ──────────────────────────────────────
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        // Stop tracks
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        if (blob.size < 1000) {
          toast.error("Registrazione troppo breve");
          return;
        }
        setIsTranscribing(true);
        try {
          const fd = new FormData();
          fd.append("audio", blob, "voice.webm");
          const { data, error } = await supabase.functions.invoke("silvio-transcribe-audio", {
            body: fd,
          });
          if (error) {
            const ctx = (error as FunctionErrorWithContext).context;
            let body: { error?: string; text?: string } = {};
            try { if (ctx instanceof Response) body = await ctx.json(); } catch { /* ignore */ }
            throw new Error(body.error ?? error.message);
          }
          const text = ((data as TranscriptionResponse | null)?.text ?? "").trim();
          if (!text) {
            toast.error("Nessun testo trascritto");
            return;
          }
          // Auto-fill input + auto-send (Silvio cliente + Silvio Admin)
          setNewMsg(text);
          setTimeout(() => {
            if (isSilvioChannel || isSilvioAdminChannel) {
              setNewMsg("");
              sendToSilvio(text);
            } else {
              toast.info("Trascritto, premi invio per inviare");
            }
          }, 100);
        } catch (e) {
          toast.error(`Trascrizione fallita: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
          setIsTranscribing(false);
        }
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setIsRecording(true);
    } catch (e) {
      toast.error(`Impossibile accedere al microfono: ${e instanceof Error ? e.message : "permesso negato"}`);
    }
  }, [isSilvioChannel, isSilvioAdminChannel, sendToSilvio]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, []);

  const handleSend = useCallback(() => {
    if (!newMsg.trim()) return;
    if (sendMutation.isPending || aiTyping || isAttaching) return;
    // Silvio cliente E Silvio Admin → entrambi usano sendToSilvio
    // (la function già routa a silvio-chat vs silvio-admin-chat in base al canale)
    if (isSilvioChannel || isSilvioAdminChannel) {
      const msg = newMsg.trim();
      setNewMsg(""); setReplyTo(null);
      sendToSilvio(msg);
    } else {
      sendMutation.mutate();
    }
  }, [newMsg, isSilvioChannel, isSilvioAdminChannel, sendToSilvio, sendMutation, aiTyping, isAttaching]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleAttachment = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedChannelId || !companyId || !userId) return;
    if (isAttaching) return;
    if (!channels.some((channel) => channel.id === selectedChannelId)) {
      toast.error("Non hai accesso a questa conversazione.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("File troppo grande (max 10 MB)");
      return;
    }
    if (!isAllowedAttachment(file)) {
      toast.error("Formato allegato non supportato");
      return;
    }

    setIsAttaching(true);
    try {
      const ext = safeAttachmentExtension(file.name);
      const path = `${companyId}/${selectedChannelId}/${crypto.randomUUID()}.${ext}`;

      // Try chat-attachments bucket first, fallback to ticket-attachments
      let bucket = "chat-attachments";
      let uploadResult = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type });
      if (uploadResult.error) {
        bucket = "ticket-attachments";
        uploadResult = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type });
      }
      if (uploadResult.error) throw uploadResult.error;

      const attachUrl = toStoredAttachmentUrl(bucket, path);

      // Insert message with attachment
      const content = newMsg.trim() || `📎 ${file.name}`;
      const { error } = await supabase.from("internal_chat_messages").insert({
        channel_id: selectedChannelId, sender_id: userId, company_id: companyId,
        content, attachment_url: attachUrl, attachment_name: file.name,
        reply_to_id: replyTo?.id || null,
      });
      if (error) throw error;

      await supabase.from("internal_chat_channels").update({ updated_at: new Date().toISOString() }).eq("id", selectedChannelId);
      await supabase.from("internal_chat_members").update({ last_read_at: new Date().toISOString() }).eq("channel_id", selectedChannelId).eq("user_id", userId);

      setNewMsg(""); setReplyTo(null);
      queryClient.invalidateQueries({ queryKey: ["internal-chat-messages", selectedChannelId] });
      queryClient.invalidateQueries({ queryKey: ["internal-chat-channels"] });
      queryClient.invalidateQueries({ queryKey: ["internal-chat-sidebar-state"] });
      refetchUnread();
      toast.success(`Allegato inviato: ${file.name}`);
    } catch (err: unknown) {
      toast.error("Errore invio allegato", { description: err instanceof Error ? err.message : "Errore sconosciuto" });
    } finally {
      setIsAttaching(false);
      if (attachInputRef.current) attachInputRef.current.value = "";
    }
  }, [selectedChannelId, companyId, userId, channels, isAttaching, newMsg, replyTo, queryClient, refetchUnread]);

  const togglePin = useCallback(async (msgId: string, currentPinned: boolean) => {
    const { error } = await supabase.from("internal_chat_messages").update({ is_pinned: !currentPinned }).eq("id", msgId);
    if (error) {
      toast.error(error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["internal-chat-messages", selectedChannelId] });
    toast.success(currentPinned ? "Pin rimosso" : "Messaggio pinnato");
  }, [selectedChannelId, queryClient]);

  const toggleReaction = useCallback(async (msgId: string, emoji: string, currentReactions: Record<string, string[]> | null | undefined) => {
    if (!userId) return;
    const reactions = { ...(currentReactions ?? {}) };
    const users = reactions[emoji] ?? [];
    if (users.includes(userId)) {
      reactions[emoji] = users.filter((u) => u !== userId);
      if (reactions[emoji].length === 0) delete reactions[emoji];
    } else {
      reactions[emoji] = [...users, userId];
    }
    const { error } = await supabase.from("internal_chat_messages").update({ reactions }).eq("id", msgId);
    if (error) {
      toast.error(error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["internal-chat-messages", selectedChannelId] });
  }, [userId, selectedChannelId, queryClient]);

  const deleteMessageMutation = useMutation({
    mutationFn: async (message: Message) => {
      if (!userId || message.sender_id !== userId) {
        throw new Error("Puoi eliminare solo i messaggi inviati da te.");
      }
      const { error } = await supabase
        .from("internal_chat_messages")
        .delete()
        .eq("id", message.id)
        .eq("sender_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      const deletedChannelId = messageToDelete?.channel_id ?? selectedChannelId;
      setMessageToDelete(null);
      queryClient.invalidateQueries({ queryKey: ["internal-chat-messages", deletedChannelId] });
      queryClient.invalidateQueries({ queryKey: ["internal-chat-sidebar-state"] });
      queryClient.invalidateQueries({ queryKey: ["internal-chat-channels"] });
      refetchUnread();
      toast.success("Messaggio eliminato");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Filter channels
  // v8.6.51 — Toggle pin per-utente sul canale. Resiliente alla migration
  // 20270518100000 non ancora applicata: se la colonna is_pinned non esiste,
  // mostra toast informativo e non spacca l'UI.
  const toggleChannelPin = useCallback(async (channelId: string) => {
    if (!userId) return;
    const current = myMemberships.find((m) => m.channel_id === channelId);
    if (!current) return;
    const next = !current.is_pinned;
    const pinClient = supabase as unknown as InternalChatMemberPinClient;
    const { error } = await pinClient
      .from("internal_chat_members")
      .update({ is_pinned: next })
      .eq("channel_id", channelId)
      .eq("user_id", userId);
    if (error) {
      if (/is_pinned.*does not exist/i.test(error.message ?? "")) {
        toast.error("Pin chat: funzionalità in attivazione (migration DB pending)");
        return;
      }
      toast.error(`Errore pin: ${error.message ?? "errore sconosciuto"}`);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["internal-chat-my-memberships"] });
    toast.success(next ? "Chat pinnata in alto" : "Pin rimosso");
  }, [userId, myMemberships, queryClient]);

  // v8.6.51 — Ordinamento sidebar:
  //   1. Canali PINNATI dall'utente (membership.is_pinned = true) in cima
  //   2. Poi per ultima attività (last_messages[channel].created_at desc)
  //   3. Tie-breaker: nome canale alfabetico
  // Memoizza una mappa channel_id → membership per accesso O(1) al pin.
  const membershipByChannel = useMemo(() => {
    const map = new Map<string, ChannelMember>();
    for (const m of myMemberships) map.set(m.channel_id, m);
    return map;
  }, [myMemberships]);

  const filteredChannels = useMemo(() => {
    let list = channels;
    if (chatFilter === "groups") list = list.filter((c) => !c.is_dm && !c.is_system);
    else if (chatFilter === "dm") list = list.filter((c) => !!c.is_dm);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((c) => {
        if (c.name.toLowerCase().includes(q)) return true;
        // Search DM by other person's name
        if (c.is_dm && c.dm_user_ids) {
          const otherId = c.dm_user_ids.find((id) => id !== userId);
          if (otherId) {
            const p = profileMap.get(otherId);
            if (p && profileName(p).toLowerCase().includes(q)) return true;
          }
        }
        return false;
      });
    }
    // Sort: pinned first, then by last message activity desc, then alpha.
    const sorted = [...list].sort((a, b) => {
      const aPinned = membershipByChannel.get(a.id)?.is_pinned ? 1 : 0;
      const bPinned = membershipByChannel.get(b.id)?.is_pinned ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned; // pinned first
      const aLast = lastMessages[a.id]?.created_at ?? "";
      const bLast = lastMessages[b.id]?.created_at ?? "";
      if (aLast !== bLast) return bLast.localeCompare(aLast); // recent first
      return a.name.localeCompare(b.name);
    });
    return sorted;
  }, [channels, chatFilter, searchQuery, userId, profileMap, membershipByChannel, lastMessages]);

  const filteredMessages = useMemo(
    () => msgSearch.trim() ? messages.filter((m) => m.content.toLowerCase().includes(msgSearch.toLowerCase())) : messages,
    [messages, msgSearch],
  );

  // DM display helpers
  const getDmProfile = useCallback((channel: Channel) => {
    if (!channel.is_dm || !channel.dm_user_ids) return undefined;
    const otherId = channel.dm_user_ids.find((id) => id !== userId);
    return otherId ? profileMap.get(otherId) : undefined;
  }, [userId, profileMap]);

  // Silvio cliente E Silvio Superadmin → display "Silvio AI" (stesso a vista)
  const chatDisplayName =
    selectedChannel?.name?.toLowerCase() === "silvio-ai" ||
    selectedChannel?.name?.toLowerCase() === "silvio-admin"
      ? "Silvio AI"
      : selectedChannel?.is_dm
        ? profileName(getDmProfile(selectedChannel))
        : selectedChannel?.name ?? "";

  const groupProfileOptions = useMemo(
    () => filterChatProfiles(profiles, userId, memberDialogSearch),
    [profiles, userId, memberDialogSearch],
  );

  const dmProfileOptions = useMemo(
    () => filterChatProfiles(profiles, userId, dmDialogSearch),
    [profiles, userId, dmDialogSearch],
  );

  // ─── Render ────────────────────────────────────────────────────────────────
  // v8.6.75 (LOOP-CHAT-ADMIN #1 + Round 2 / MORE-5) — Su mobile usiamo 100dvh
  // (dynamic viewport height) per gestire correttamente l'address bar
  // dinamica di iOS Safari: 100vh include sempre la barra anche quando è
  // collassata, causando scroll fantasma e l'ultima riga della chat tagliata.
  // 100dvh segue l'area visibile reale.
  // Sottraggo 7.5rem (120px) = header AdminLayout (44px) + main p-3 top
  // (12px) + main pb-20 (80px) − ~16px margine. Su desktop manteniamo
  // 100vh - 120px (header 56px + padding 64px).
  // Fallback: prima dichiariamo 100vh (sempre supportato, da Safari 1.0) poi
  // overridiamo via supports-[height:100dvh]: per i browser moderni
  // (iOS Safari ≥15.4, Chrome ≥108, Firefox ≥101). Browser più vecchi
  // restano sul vecchio 100vh comportamento, niente regressione.
  //
  // v8.6.75 (LOOP-CHAT-ADMIN Round 3 / FULLSCREEN-CONV v2) — Mobile + conv
  // aperta = fullscreen vero (`fixed inset-0 z-[60]`). Prima usavo `top-11`
  // assumendo l'header AdminLayout (44px), ma su CompanyLayout (/azienda/chat)
  // l'header è h-14 (56px) e parte del nome azienda restava coperta dietro
  // l'header chat → "sopra si vede male" segnalato dall'utente.
  // Soluzione: full-screen takeover stile WhatsApp/iMessage. Quando entri in
  // una conversazione sparisce TUTTO (header app + bottom nav) e vedi solo:
  //   [chat header con back] [messaggi] [compose bar safe-area]
  // Il back button del chat header → torna alla lista → app UI riappare.
  // pt-[env(safe-area-inset-top)] rispetta il notch iPhone (dynamic island).
  const isMobileConvOpen = !!(showMobile && selectedChannelId);
  return (
    <div className={cn(
      // v8.6.75 (LOOP-CHAT-ADMIN Round 6 / SLATE-THEME) — bg-slate-50 invece
      // di bg-white puro (utente "bianco bianco non mi piace"). Slate-50 dà
      // profondità visiva soft, sufficiente a far risaltare i bubble bianchi/
      // colorati dei messaggi sopra. Watermark logo rimosso (era invasivo).
      "h-[calc(100vh-7.5rem)] supports-[height:100dvh]:h-[calc(100dvh-7.5rem)] md:h-[calc(100vh-120px)] flex overflow-hidden rounded-none sm:rounded-xl border-y sm:border shadow-sm bg-slate-50 dark:bg-gray-950 -mx-3 sm:mx-0",
      isMobileConvOpen && "max-md:!fixed max-md:!inset-0 max-md:!h-auto max-md:!z-[60] max-md:!border-0 max-md:!rounded-none max-md:!shadow-none max-md:!mx-0 max-md:!pt-[env(safe-area-inset-top)]",
    )}>
      {/* ═══ LEFT PANEL: Chat List ═══ */}
      <div className={cn(
        "w-full md:w-[380px] lg:w-[420px] md:min-w-[320px] flex flex-col bg-white dark:bg-[#111b21] border-r border-[#e9edef] dark:border-gray-800",
        showMobile && selectedChannelId ? "hidden md:flex" : "flex",
      )}>
        {/* Header */}
        <div className="h-[60px] bg-[#f0f2f5] dark:bg-[#202c33] px-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            {userId && (
              <Avatar className="h-10 w-10">
                {profileMap.get(userId!)?.avatar_url && <AvatarImage src={profileMap.get(userId!)!.avatar_url!} />}
                <AvatarFallback className={cn("text-white font-semibold text-sm", userColor(userId ?? ""))}>
                  {initials(profileMap.get(userId ?? ""))}
                </AvatarFallback>
              </Avatar>
            )}
            <span className="font-semibold text-[15px]">Chat</span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-[#54656f] dark:text-gray-400"
              onClick={() => setCreateDmOpen(true)} title="Nuovo messaggio interno" aria-label="Nuovo messaggio interno">
              <UserPlus className="h-5 w-5" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-[#54656f] dark:text-gray-400" aria-label="Apri menu chat">
                  <Plus className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setCreateDmOpen(true)}>
                  <MessageCircle className="h-4 w-4 mr-2" /> Nuovo messaggio interno
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setCreateOpen(true)}>
                  <UsersRound className="h-4 w-4 mr-2" /> Nuovo gruppo
                </DropdownMenuItem>
                {isCompanyAdmin && (
                  <DropdownMenuItem
                    onClick={() => {
                      // MP-PER-001: scorciatoia "Comunicazioni team" — apre il
                      // dialog Nuovo gruppo già pre-popolato con tutti i membri
                      // interni dell'azienda e nome standardizzato.
                      // Se l'admin vuole modificare può farlo, poi conferma.
                      const existing = channels.find(
                        (c) => !c.is_dm && c.name.toLowerCase().includes("comunicazion"),
                      );
                      if (existing) {
                        handleSelectChannel(existing.id);
                        toast.success("Canale Comunicazioni team aperto");
                        return;
                      }
                      setChannelName("📢 Comunicazioni");
                      setChannelDesc("Annunci ufficiali dell'azienda a tutto il team");
                      // Tutti i profili interni (esclude super_admin esterni se non in `profiles`)
                      setSelectedMembers(Array.from(internalProfileIds).filter((id) => id !== userId));
                      setCreateOpen(true);
                    }}
                  >
                    <Megaphone className="h-4 w-4 mr-2" /> Comunicazioni team (azienda)
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Search — v8.6.75 (LOOP-CHAT-ADMIN Round 2 / MORE-9): text-base
            su mobile (16px) evita zoom iOS al focus. h-10 invece di h-9 per
            tap target più comodo su mobile. */}
        <div className="px-2 py-1.5 bg-white dark:bg-[#111b21]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#54656f] dark:text-gray-500" />
            <Input
              placeholder="Cerca nella chat interna"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              inputMode="search"
              enterKeyHint="search"
              className="pl-10 h-10 md:h-9 rounded-lg bg-[#f0f2f5] dark:bg-[#202c33] border-0 text-base md:text-sm placeholder:text-[#667781]"
            />
          </div>
        </div>

        {/* Filter tabs — v8.6.75 (LOOP-CHAT-ADMIN Round 2 / MORE-2):
            min-h-9 (36px) sul mobile evita il "fat-finger miss" — prima
            l'altezza tap era ~24px (py-1 + line-height) molto sotto la
            soglia comoda. 36px è il compromesso usato da WhatsApp/Telegram
            per filter pill nella sidebar (44px occupava troppo verticale).
            Aggiungo anche active:bg-* per feedback tap mobile. */}
        <div className="px-3 py-1.5 flex gap-2 bg-white dark:bg-[#111b21]">
          {(["all", "groups", "dm"] as const).map((f) => (
            <button
              type="button"
              key={f}
              onClick={() => setChatFilter(f)}
              className={cn(
                "px-3.5 min-h-9 inline-flex items-center rounded-full text-[13px] font-medium transition-colors",
                chatFilter === f
                  ? "bg-[#00a884]/10 text-[#00a884] dark:bg-[#00a884]/20"
                  : "text-[#54656f] dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 active:bg-gray-200 dark:active:bg-white/10",
              )}
            >
              {f === "all" ? "Tutte" : f === "groups" ? "Gruppi" : "Messaggi"}
            </button>
          ))}
        </div>

        {/* Chat List */}
        <ScrollArea className="flex-1">
          {chatLoading ? (
            <div className="flex flex-col gap-2 p-3">
              {slowChatLoad && (
                <div className="mb-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-[13px] text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-100">
                  <div className="flex items-center gap-2 font-medium">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Preparazione chat in corso
                  </div>
                  <p className="mt-1 text-blue-800/80 dark:text-blue-100/75">
                    Sto recuperando canali, membri e il canale Silvio. Se Supabase è appena ripartito può richiedere qualche secondo.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-2 h-8 border-blue-200 bg-white text-blue-800 hover:bg-blue-100"
                    onClick={refetchChatData}
                  >
                    <RefreshCw className="mr-2 h-3.5 w-3.5" />
                    Riprova caricamento
                  </Button>
                </div>
              )}
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="flex items-center gap-3 px-1 py-2">
                  <div className="h-12 w-12 rounded-full bg-[#f0f2f5] dark:bg-white/10 animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 w-2/3 rounded bg-[#f0f2f5] dark:bg-white/10 animate-pulse" />
                    <div className="h-3 w-5/6 rounded bg-[#f0f2f5] dark:bg-white/10 animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : chatDataError ? (
            <div className="p-4">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Chat non caricata</AlertTitle>
                <AlertDescription>
                  Non riesco a recuperare conversazioni e partecipanti. Riprova tra poco.
                </AlertDescription>
              </Alert>
              <Button size="sm" variant="outline" className="mt-3 w-full" onClick={refetchChatData}>
                <RefreshCw className="h-4 w-4 mr-2" /> Riprova
              </Button>
            </div>
          ) : filteredChannels.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <MessageCircle className="h-12 w-12 text-[#54656f]/30 mb-4" />
              <p className="text-[15px] text-[#54656f] dark:text-gray-400">
                {searchQuery ? "Nessun risultato" : "Nessuna chat"}
              </p>
              <p className="text-[13px] text-muted-foreground mt-1">
                Inizia una conversazione con una persona dell'azienda
              </p>
              <div className="flex gap-2 mt-4">
                <Button size="sm" variant="outline" className="rounded-full" onClick={() => setCreateDmOpen(true)}>
                  <UserPlus className="h-3.5 w-3.5 mr-1.5" /> Messaggio
                </Button>
                <Button size="sm" variant="outline" className="rounded-full" onClick={() => setCreateOpen(true)}>
                  <UsersRound className="h-3.5 w-3.5 mr-1.5" /> Gruppo
                </Button>
              </div>
            </div>
          ) : (
            filteredChannels.map((ch) => (
              <ChatListItem
                key={ch.id}
                channel={ch}
                isActive={ch.id === selectedChannelId}
                unread={unreadCounts[ch.id] ?? 0}
                lastMsg={lastMessages[ch.id]}
                profileMap={profileMap}
                userId={userId}
                members={members}
                onClick={() => handleSelectChannel(ch.id)}
                isPinned={!!membershipByChannel.get(ch.id)?.is_pinned}
                onTogglePin={() => toggleChannelPin(ch.id)}
              />
            ))
          )}
        </ScrollArea>
      </div>

      {/* ═══ RIGHT PANEL: Chat Window ═══ */}
      <div className={cn(
        "flex-1 flex flex-col min-w-0",
        !showMobile && selectedChannelId ? "hidden md:flex" : !selectedChannelId ? "hidden md:flex" : "flex",
      )}>
        {!selectedChannel ? (
          /* Empty state */
          <div className="flex-1 flex items-center justify-center bg-[#f0f2f5] dark:bg-[#222e35]">
            <div className="text-center max-w-md px-8">
              <div className="h-64 w-64 mx-auto mb-6 opacity-50">
                <svg viewBox="0 0 303 172" className="w-full h-full text-[#8696a0]">
                  <path fill="currentColor" d="M229.565 160.229c32.647-16.036 55.563-50.387 55.563-89.838C285.128 31.575 253.553 0 214.736 0c-27.351 0-51.109 15.67-62.681 38.508C140.485 15.67 116.727 0 89.377 0 50.56 0 18.985 31.575 18.985 70.391c0 39.451 22.916 73.802 55.563 89.838 23.509 11.547 76.508 11.547 77.509 11.547s54-0 77.508-11.547z" opacity="0.08" />
                </svg>
              </div>
              <h2 className="text-[28px] font-light text-[#41525d] dark:text-gray-300 mb-2">
                Chat Team
              </h2>
              <p className="text-[14px] text-[#8696a0] leading-relaxed">
                Invia e ricevi messaggi dal tuo team. Crea gruppi di lavoro e comunica in tempo reale.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Chat Header — v8.6.75 (LUCIA-FULL-REMOVAL): gradient Lucia
                violet rimosso, header sempre bg neutro. */}
            <div className="h-[60px] px-4 flex items-center justify-between shrink-0 border-b bg-[#f0f2f5] dark:bg-[#202c33]">
              <div className="flex items-center gap-3 min-w-0">
                {/* Back button (mobile) — v8.6.75 (LOOP-CHAT-ADMIN #3):
                    h-11 w-11 = 44x44px (Apple HIG min touch target). -ml-2
                    compensa l'allargamento mantenendo l'allineamento visivo
                    rispetto al bordo sinistro dell'header. */}
                <Button variant="ghost" size="icon" className="h-11 w-11 -ml-2 md:hidden shrink-0"
                  onClick={() => setShowMobile(false)} aria-label="Torna alla lista chat">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                {/* Avatar — v8.6.75 (LUCIA-FULL-REMOVAL): branch Lucia
                    (bot viola) rimosso. Resta Silvio (brain arancio), DM,
                    gruppo verde. */}
                {(isSilvioChannel || isSilvioAdminChannel) ? (
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-orange-500 via-orange-500 to-amber-400 flex items-center justify-center shrink-0 ring-1 ring-orange-300/40 shadow-sm shadow-orange-300/30">
                    <Brain className="h-5 w-5 text-white" strokeWidth={2.4} />
                  </div>
                ) : selectedChannel.is_dm ? (
                  <Avatar className="h-10 w-10 shrink-0">
                    {getDmProfile(selectedChannel)?.avatar_url && <AvatarImage src={getDmProfile(selectedChannel)!.avatar_url!} />}
                    <AvatarFallback className={cn("text-white font-semibold text-sm",
                      userColor(getDmProfile(selectedChannel)?.id ?? ""))}>
                      {initials(getDmProfile(selectedChannel))}
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  <div className="h-10 w-10 rounded-full bg-[#00a884] flex items-center justify-center shrink-0">
                    <UsersRound className="h-5 w-5 text-white" />
                  </div>
                )}
                <div className="min-w-0">
                  <h3 className="font-semibold text-[15px] truncate flex items-center gap-2">
                    {chatDisplayName}
                  </h3>
                  <p className="text-[12px] text-[#667781] dark:text-gray-400 truncate">
                    {typingUsers.length > 0
                      ? `${typingUsers.join(", ")} sta scrivendo...`
                      : selectedChannel.is_dm
                        ? "Online"
                        : `${channelMembers.length} partecipanti`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-0.5">
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-[#54656f] dark:text-gray-400"
                  onClick={() => { setShowSearch((s) => !s); setMsgSearch(""); }} aria-label="Cerca nei messaggi">
                  <Search className="h-5 w-5" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-[#54656f] dark:text-gray-400" aria-label="Opzioni conversazione">
                      <MoreVertical className="h-5 w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setShowSearch(true)}>
                      <Search className="h-4 w-4 mr-2" /> Cerca nei messaggi
                    </DropdownMenuItem>
                    {!selectedChannel.is_dm && (
                      <DropdownMenuItem>
                        <Users className="h-4 w-4 mr-2" /> Info gruppo
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Search bar — v8.6.75 (LOOP-CHAT-ADMIN Round 2 / MORE-9):
                h-10 mobile + text-base evita zoom iOS, h-8 + text-sm tornano
                in vista desktop dove il layout è più compatto. */}
            {showSearch && (
              <div className="px-4 py-2 bg-white dark:bg-[#1f2c34] border-b">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Cerca nei messaggi..."
                    value={msgSearch} onChange={(e) => setMsgSearch(e.target.value)}
                    inputMode="search"
                    enterKeyHint="search"
                    className="pl-9 h-10 md:h-8 text-base md:text-sm bg-[#f0f2f5] dark:bg-[#202c33] border-0"
                    autoFocus
                  />
                  <button type="button" onClick={() => { setShowSearch(false); setMsgSearch(""); }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2" aria-label="Chiudi ricerca messaggi">
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
                {msgSearch && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {filteredMessages.length} risultati
                  </p>
                )}
              </div>
            )}

            {/* ═══ Messages ═══
                v8.6.75 (LOOP-CHAT-ADMIN Round 6 / SLATE-THEME) — Watermark
                logo EdiliziaInCloud rimosso (utente: "elimina il background
                con edilizia in cloud"). Sfondo slate-50 pulito. Bubble miei
                verde WhatsApp + bubble ricevuti slate-100 (vedi MessageBubble)
                creano il contrasto naturale senza pattern decorativi. */}
            <div
              ref={(el) => {
                scrollAreaRef.current = el;
                messagesContainerRef.current = el;
              }}
              onScroll={onMessagesScroll}
              className="flex-1 overflow-y-auto px-4 md:px-12 lg:px-16 py-4 bg-slate-50 dark:bg-gray-950"
            >
              {messagesError ? (
                <div className="text-center py-12">
                  <p className="text-sm text-destructive mb-3">Errore nel caricamento.</p>
                  <Button variant="outline" size="sm" onClick={() => retryMessages()}>Riprova</Button>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  {/* v8.6.75 (LOOP-CHAT-ADMIN Round 5 / LUCIA-REMOVED):
                      Empty state "Ciao sono Lucia" rimosso (canale lucia-ai
                      non esiste più). Restano solo gli empty state generici
                      per DM / gruppi. Colore beige #fcf4cb sostituito con
                      bianco + border slate per coerenza white-theme. */}
                  <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-3 shadow-sm max-w-md text-center">
                    <p className="text-[13px] text-slate-600 dark:text-gray-300">
                      🔒 I messaggi in questa chat sono visibili solo ai partecipanti.
                    </p>
                  </div>
                </div>
              ) : (
                <div>
                  {hasOlder && !msgSearch.trim() && (
                    <div className="mb-3 flex justify-center">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-full bg-white/90 shadow-sm"
                        onClick={loadOlder}
                        disabled={isLoadingOlder}
                      >
                        {isLoadingOlder ? (
                          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="mr-2 h-3.5 w-3.5" />
                        )}
                        Carica messaggi precedenti
                      </Button>
                    </div>
                  )}
                  {filteredMessages.map((msg, idx) => {
                    const isMe = msg.sender_id === userId;
                    const sender = profileMap.get(msg.sender_id);
                    const prevMsg = filteredMessages[idx - 1];
                    const showAvatar = !prevMsg || prevMsg.sender_id !== msg.sender_id;
                    const replyMsg = msg.reply_to_id ? messages.find((m) => m.id === msg.reply_to_id) : null;

                    // Date separator
                    const showDateSep = idx === 0 || !isSameDay(new Date(msg.created_at), new Date(prevMsg!.created_at));

                    return (
                      <React.Fragment key={msg.id}>
                        {showDateSep && (
                          <div className="flex justify-center my-4">
                            <span className="bg-white dark:bg-[#202c33] text-[#54656f] dark:text-gray-400 text-[12px] font-medium px-3 py-1 rounded-lg shadow-sm">
                              {formatDateSeparator(msg.created_at)}
                            </span>
                          </div>
                        )}
                        <MessageBubble
                          msg={msg} isMe={isMe} sender={sender}
                          showAvatar={showAvatar && !isMe && !selectedChannel?.is_dm}
                          replyMsg={replyMsg} profileMap={profileMap}
                          onReply={() => setReplyTo(msg)}
                          onPin={() => togglePin(msg.id, !!msg.is_pinned)}
                          onDelete={isMe ? () => setMessageToDelete(msg) : undefined}
                          onReaction={(emoji) => toggleReaction(msg.id, emoji, msg.reactions)}
                          userId={userId}
                          onAskFollowup={(isSilvioChannel || isSilvioAdminChannel) ? sendToSilvio : undefined}
                        />
                      </React.Fragment>
                    );
                  })}
                  {/* AI bot typing (Silvio) */}
                  {aiTyping && isAIChannel && (
                    <div className="flex justify-start mb-1 mt-3">
                      <div className="ml-9 bg-white dark:bg-[#202c33] rounded-lg rounded-tl-none px-4 py-3 shadow-sm">
                        <div className="flex items-center gap-2">
                          <div className="flex gap-1">
                            <span className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                            <span className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                            <span className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                          </div>
                          <span className="text-xs text-violet-500">
                            Silvio sta pensando...
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Reply banner — v8.6.75 (LOOP-CHAT-ADMIN Round 5) bg bianco
                coerente con white-theme; accent verde teal sostituito con blu. */}
            {replyTo && (
              <div className="px-4 py-2 bg-white dark:bg-[#1f2c34] border-t flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-1 h-10 rounded-full bg-blue-600 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold" style={{ color: getColorHex(replyTo.sender_id) }}>
                      {replyTo.sender_id === userId ? "Tu" : profileName(profileMap.get(replyTo.sender_id))}
                    </p>
                    <p className="text-[13px] text-[#667781] truncate">{replyTo.content.slice(0, 80)}</p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setReplyTo(null)} aria-label="Annulla risposta">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* Typing indicator */}
            {typingUsers.length > 0 && !isLuciaChannel && (
              <div className="px-4 py-1 bg-[#f0f2f5] dark:bg-[#1f2c34]">
                <p className="text-xs text-[#667781] flex items-center gap-1">
                  <span className="inline-flex gap-0.5">
                    <span className="w-1 h-1 rounded-full bg-[#667781] animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1 h-1 rounded-full bg-[#667781] animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1 h-1 rounded-full bg-[#667781] animate-bounce" style={{ animationDelay: "300ms" }} />
                  </span>
                  {typingUsers.join(", ")} {typingUsers.length === 1 ? "sta" : "stanno"} scrivendo…
                </p>
              </div>
            )}

            {silvioError && isAIChannel && (
              <div className="border-t border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-900 dark:border-orange-900/50 dark:bg-orange-950/30 dark:text-orange-100">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <p className="min-w-0">
                      Silvio non ha completato la risposta: <span className="font-medium">{silvioError}</span>
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {lastSilvioPrompt && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 border-orange-200 bg-white text-orange-700 hover:bg-orange-100"
                        onClick={() => sendToSilvio(lastSilvioPrompt)}
                        disabled={aiTyping}
                      >
                        Riprova
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 text-orange-700 hover:bg-orange-100"
                      onClick={() => setSilvioError(null)}
                    >
                      Chiudi
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* AI Test Lab — model selector bar (sopra compose, solo Silvio + demo) */}
            {isSilvioChannel && aiSelector.showSelector && aiSelector.availableModels.length > 0 && (
              <div className="border-t bg-orange-50/30 px-3 py-1.5 flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wide text-orange-700 font-semibold">AI Test Lab:</span>
                <AIModelSelector
                  models={aiSelector.availableModels}
                  selectedModel={aiSelector.selectedModel}
                  onSelect={aiSelector.setSelectedModel}
                  loading={aiSelector.loading}
                  onRefresh={aiSelector.refresh}
                  showCost
                />
              </div>
            )}

            {/* ═══ Compose Bar ═══
                v8.6.75 (LOOP-CHAT-ADMIN Round 6 / SLATE-THEME) — Compose
                bar BLU UNIFORME per tutti i canali (richiesta utente: "la
                barra in basso la farei blu sia per silvio che per altre
                chat"). L'identità Silvio resta solo nell'avatar/header
                (Brain arancio), non nei controlli di composizione.
                bg bianco + border-top blu sottile. */}
            <div className={cn(
              "px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] flex items-end gap-2 border-t-2",
              "bg-white dark:bg-[#202c33]",
              "border-t-blue-200 dark:border-t-blue-900/40",
            )}>
              {/* Skill picker (solo Silvio) — pattern slash command */}
              {isSilvioChannel && (
                <Popover open={silvioSkillsOpen} onOpenChange={setSilvioSkillsOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 rounded-full text-orange-600 hover:text-orange-700 hover:bg-orange-100 shrink-0"
                      title="Skill di Silvio (azioni rapide)"
                      aria-label="Apri skill rapide di Silvio"
                    >
                      <Plus className="h-6 w-6" strokeWidth={2.4} />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    side="top"
                    align="start"
                    sideOffset={8}
                    className="w-[340px] sm:w-[380px] p-0 border-orange-100 shadow-2xl rounded-2xl overflow-hidden flex flex-col"
                    style={{ maxHeight: "min(70vh, 540px)" }}
                  >
                    <div className="bg-gradient-to-br from-orange-500 to-amber-400 px-3 py-2 text-white shrink-0">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4" fill="currentColor" />
                        <p className="text-xs font-semibold">Skill rapide di Silvio</p>
                      </div>
                      <p className="text-[10px] opacity-90 leading-tight">Click su una skill → riempie il messaggio</p>
                    </div>
                    <div className="overflow-y-auto p-2 space-y-3 flex-1">
                      {(["data", "doc", "operations", "advisor"] as const).map((cat) => {
                        const items = SILVIO_SKILLS.filter((s) => s.category === cat);
                        if (items.length === 0) return null;
                        return (
                          <div key={cat}>
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 px-1.5 mb-1">
                              {SILVIO_SKILL_CATEGORY_LABELS[cat]}
                            </p>
                            <div className="space-y-0.5">
                              {items.map((skill) => (
                                <button
                                  key={skill.id}
                                  type="button"
                                  onClick={() => {
                                    setNewMsg(skill.template);
                                    setSilvioSkillsOpen(false);
                                  }}
                                  className="w-full flex items-start gap-2 px-2 py-1.5 rounded-md text-left hover:bg-orange-50 transition-colors group"
                                >
                                  <span className="text-base shrink-0 mt-0.5">{skill.emoji}</span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[12px] font-semibold text-slate-800 group-hover:text-orange-700 leading-tight">
                                      {skill.label}
                                    </p>
                                    <p className="text-[10px] text-slate-500 leading-tight truncate">{skill.hint}</p>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
              )}
              {/* Emoji + paperclip — v8.6.75 (LOOP-CHAT-ADMIN Round 6 /
                  SLATE-THEME): BLU uniforme per tutti i canali (richiesta
                  utente). EmojiPicker mantiene accent="orange" su Silvio
                  per coerenza con il colore degli emoji rendering nei messaggi
                  AI (l'accent del picker è interno, non il bottone trigger). */}
              <EmojiPicker
                accent={(isSilvioChannel || isSilvioAdminChannel) ? "orange" : "green"}
                onPick={(emoji) => setNewMsg((cur) => cur + emoji)}
                trigger={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 rounded-full shrink-0 transition-colors text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                    type="button"
                    aria-label="Inserisci emoji"
                  >
                    <Smile className="h-5 w-5" />
                  </Button>
                }
              />
              <Button variant="ghost" size="icon"
                className="h-10 w-10 rounded-full shrink-0 transition-colors text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                onClick={() => isSilvioChannel ? silvioImageInputRef.current?.click() : attachInputRef.current?.click()}
                disabled={isAttaching || silvioUploading}
                title={isSilvioChannel ? "Carica foto cantiere o fattura" : "Invia allegato"}
                aria-label={isSilvioChannel ? "Carica foto cantiere o fattura" : "Invia allegato"}
              >
                {(isAttaching || silvioUploading) ? <Loader2 className="h-5 w-5 animate-spin" /> : <Paperclip className="h-5 w-5" />}
              </Button>
              <input
                ref={attachInputRef}
                type="file"
                className="hidden"
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
                onChange={handleAttachment}
              />
              <input
                ref={silvioImageInputRef}
                type="file"
                className="hidden"
                accept="image/*,.pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadAndAskSilvio(file);
                  e.target.value = "";
                }}
              />
              <div className="flex-1">
                {/* Textarea auto-grow stile WhatsApp (max 5 righe poi scroll interno).
                    Sostituisce il vecchio <Input> single-line che troncava i testi
                    incollati. Enter invia, Shift+Enter capo.
                    v8.6.75 (LOOP-CHAT-ADMIN #4): enterKeyHint="send" mostra
                    l'icona aeroplano "Invia" nella tastiera virtuale iOS/Android
                    invece del generico "Go". autoCapitalize="sentences" per
                    capitalizzazione naturale italiana. */}
                <textarea
                  ref={newMsgTextareaRef}
                  placeholder={isSilvioChannel ? "Scrivi a Silvio..." : "Scrivi un messaggio"}
                  value={newMsg}
                  onChange={(e) => { setNewMsg(e.target.value); if (!isLuciaChannel) broadcastTyping(); }}
                  onKeyDown={handleKeyDown}
                  disabled={aiTyping}
                  rows={1}
                  enterKeyHint="send"
                  autoCapitalize="sentences"
                  autoCorrect="on"
                  spellCheck={true}
                  className={cn(
                    // v8.6.75 (LOOP-CHAT-ADMIN Round 6 / SLATE-THEME):
                    // border blu uniforme + bg slate-50 per contrasto visivo
                    // su compose bar bianca. text-base mobile = no iOS zoom.
                    "block w-full resize-none rounded-xl border text-base md:text-[15px] px-3 py-2 leading-relaxed",
                    "focus:outline-none focus-visible:ring-2 focus-visible:border-transparent",
                    "bg-slate-50 dark:bg-[#2a3942]",
                    "border-blue-200 dark:border-blue-900/40 focus-visible:ring-blue-500",
                  )}
                />
              </div>
              {newMsg.trim() ? (
                <Button
                  onClick={handleSend}
                  disabled={sendMutation.isPending || aiTyping}
                  size="icon"
                  aria-label={isAIChannel ? "Invia messaggio a Silvio" : "Invia messaggio"}
                  className={cn(
                    // v8.6.75 (LOOP-CHAT-ADMIN Round 6 / SLATE-THEME):
                    // Send button BLU UNIFORME (compose bar uniforme blu,
                    // anche per Silvio). Identità Silvio resta solo nei
                    // bubble messaggi (arancio chiaro) e nell'avatar header.
                    "h-11 w-11 rounded-full shrink-0 shadow-md transition-all hover:shadow-lg",
                    "bg-blue-600 hover:bg-blue-700 text-white",
                  )}
                >
                  {aiTyping ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" strokeWidth={2.4} />}
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={isTranscribing || aiTyping}
                  className={cn(
                    "h-10 w-10 rounded-full shrink-0",
                    isRecording
                      ? "bg-rose-100 text-rose-600 hover:bg-rose-200 animate-pulse"
                      : isTranscribing
                        ? "text-violet-600"
                        : "text-[#54656f]"
                  )}
                  title={
                    isRecording ? "Stop registrazione" :
                    isTranscribing ? "Trascrivendo…" : "Registra messaggio vocale"
                  }
                  aria-label={
                    isRecording ? "Ferma registrazione" :
                    isTranscribing ? "Trascrizione in corso" : "Registra messaggio vocale"
                  }
                >
                  {isTranscribing ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : isRecording ? (
                    <span className="relative flex">
                      <span className="absolute h-3 w-3 rounded-full bg-rose-600 -top-1 -right-1 animate-ping" />
                      <Mic className="h-6 w-6" />
                    </span>
                  ) : (
                    <Mic className="h-6 w-6" />
                  )}
                </Button>
              )}
            </div>
          </>
        )}
      </div>

      {/* ═══ Create Group Dialog ═══ */}
      <Dialog open={createOpen} onOpenChange={(open) => {
        setCreateOpen(open);
        if (!open) setMemberDialogSearch("");
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UsersRound className="h-5 w-5 text-[#00a884]" /> Nuovo Gruppo
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome gruppo</Label>
              <Input value={channelName} onChange={(e) => setChannelName(e.target.value)}
                placeholder="es. Team Cantiere, Ufficio Tecnico" className="mt-1" />
            </div>
            <div>
              <Label>Descrizione</Label>
              <Input value={channelDesc} onChange={(e) => setChannelDesc(e.target.value)}
                placeholder="Opzionale" className="mt-1" />
            </div>
            <div>
              <Label>Partecipanti</Label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={memberDialogSearch}
                  onChange={(e) => setMemberDialogSearch(e.target.value)}
                  placeholder="Cerca nome o email"
                  className="pl-9"
                />
              </div>
              <ScrollArea className="h-[200px] border rounded-lg p-2 mt-1">
                {groupProfileOptions.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Nessun partecipante trovato.
                  </div>
                ) : groupProfileOptions.map((p) => (
                  <label key={p.id} className="flex items-center gap-3 py-2 px-2 hover:bg-gray-50 dark:hover:bg-white/5 rounded-lg cursor-pointer">
                    <Checkbox
                      aria-label={`Seleziona ${profileName(p)}`}
                      checked={selectedMembers.includes(p.id)}
                      onCheckedChange={(checked) => {
                        setSelectedMembers((prev) =>
                          checked ? [...prev, p.id] : prev.filter((id) => id !== p.id)
                        );
                      }}
                    />
                    <Avatar className="h-8 w-8">
                      {p.avatar_url && <AvatarImage src={p.avatar_url} />}
                      <AvatarFallback className={cn("text-white text-xs font-semibold", userColor(p.id))}>
                        {initials(p)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">{p.first_name} {p.last_name}</p>
                      <p className="text-xs text-muted-foreground">{p.email}</p>
                    </div>
                  </label>
                ))}
              </ScrollArea>
              {selectedMembers.length > 0 && (
                <p className="text-xs text-[#00a884] mt-1 font-medium">
                  {selectedMembers.length} selezionati
                </p>
              )}
              {selectedMembers.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Puoi creare il gruppo ora e aggiungere persone in seguito.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={!channelName.trim() || createChannelMutation.isPending}
              onClick={() => createChannelMutation.mutate()}
              className="bg-[#00a884] hover:bg-[#008f72]"
            >
              <UsersRound className="h-4 w-4 mr-2" /> Crea Gruppo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ New DM Dialog ═══ */}
      <Dialog open={createDmOpen} onOpenChange={(open) => {
        setCreateDmOpen(open);
        if (!open) setDmDialogSearch("");
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-[#00a884]" /> Nuovo messaggio interno
            </DialogTitle>
          </DialogHeader>
          <div>
            <Label>Seleziona persona aziendale</Label>
            <div className="relative mt-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={dmDialogSearch}
                onChange={(e) => setDmDialogSearch(e.target.value)}
                placeholder="Cerca nome o email"
                className="pl-9"
              />
            </div>
            <ScrollArea className="h-[300px] border rounded-lg p-1 mt-2">
              {dmProfileOptions.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {dmDialogSearch
                    ? "Nessuna persona trovata."
                    : "Nessuna persona interna disponibile. I clienti non vengono mostrati nella chat aziendale."}
                </div>
              ) : dmProfileOptions.map((p) => (
                <button
                  key={p.id}
                  onClick={() => createDm(p.id)}
                  aria-label={`Apri chat con ${profileName(p)}`}
                  className="w-full flex items-center gap-3 py-3 px-3 hover:bg-gray-50 dark:hover:bg-white/5 rounded-lg text-left transition-colors"
                >
                  <Avatar className="h-11 w-11">
                    {p.avatar_url && <AvatarImage src={p.avatar_url} />}
                    <AvatarFallback className={cn("text-white font-semibold text-sm", userColor(p.id))}>
                      {initials(p)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-[15px] font-medium">{p.first_name} {p.last_name}</p>
                    <p className="text-[13px] text-muted-foreground">{p.email}</p>
                  </div>
                </button>
              ))}
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!messageToDelete} onOpenChange={(open) => !open && setMessageToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare il messaggio?</AlertDialogTitle>
            <AlertDialogDescription>
              Il messaggio verrà rimosso dalla conversazione. L'operazione è consentita solo per i messaggi inviati da te.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMessageMutation.isPending}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={!messageToDelete || deleteMessageMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (messageToDelete) deleteMessageMutation.mutate(messageToDelete);
              }}
            >
              {deleteMessageMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
