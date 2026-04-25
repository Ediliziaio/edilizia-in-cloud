/**
 * InternalChat — WhatsApp-style team chat
 * Supports DMs, group chats, Lucia AI bot, reactions, replies, pins
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, isToday, isYesterday, isSameDay } from "date-fns";
import { it } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Hash, Plus, Send, Search, Users, MessageCircle, CornerDownRight, Bot, Sparkles, Loader2,
  Smile, X, Pin, PinOff, ArrowLeft, MoreVertical, UserPlus, UsersRound, Check, CheckCheck,
  Paperclip, Image as ImageIcon, Mic, Phone, Video, CircleDot,
} from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";

// ─── Constants ───────────────────────────────────────────────────────────────
const QUICK_REACTIONS = ["👍", "❤️", "😂", "🙏", "👏", "🔥", "✅", "😮"];
const LUCIA_SENDER_ID = "00000000-0000-0000-0000-000000000001";

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
}

interface Profile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  avatar_url?: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function renderMarkdown(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, '<code class="bg-black/10 px-1 py-0.5 rounded text-xs font-mono">$1</code>')
    .replace(/@(\w+)/g, '<span class="text-blue-600 font-medium">@$1</span>')
    .replace(/\n/g, "<br/>");
}

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
  return `${p.first_name} ${p.last_name}`;
}

// ─── Data Hook ───────────────────────────────────────────────────────────────
/**
 * @param companyIdOverride - optional override per riuso dal lato Super Admin.
 *   I super admin non hanno `effectiveCompany`, ma possono usare il chat
 *   passando l'id della "platform admin company". Se omesso, fallback al
 *   normale flusso azienda (effectiveCompany?.id).
 */
function useInternalChat(companyIdOverride?: string) {
  const { user, effectiveCompany } = useAuth();
  const companyId = companyIdOverride ?? effectiveCompany?.id;
  const userId = user?.id;
  const queryClient = useQueryClient();

  const { data: channels = [] } = useQuery({
    queryKey: ["internal-chat-channels", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("internal_chat_channels").select("*")
        .eq("company_id", companyId!)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as Channel[];
    },
  });

  const { data: members = [] } = useQuery({
    queryKey: ["internal-chat-members", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("internal_chat_members").select("*")
        .eq("company_id", companyId!);
      if (error) throw error;
      return data as ChannelMember[];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["chat-profiles", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles").select("id, first_name, last_name, email, avatar_url")
        .eq("company_id", companyId!);
      if (error) throw error;
      return data as Profile[];
    },
  });

  // Last message per channel for preview — single batch query instead of N+1
  const channelIds = useMemo(() => channels.map((c) => c.id), [channels]);
  const { data: lastMessages = {} } = useQuery({
    queryKey: ["internal-chat-last-messages", companyId, channelIds],
    enabled: !!companyId && channelIds.length > 0,
    queryFn: async () => {
      // Single query: fetch recent messages for all channels, then pick last per channel
      const { data, error } = await supabase
        .from("internal_chat_messages")
        .select("*")
        .in("channel_id", channelIds)
        .order("created_at", { ascending: false })
        .limit(channelIds.length * 2); // slightly over to handle edge cases
      if (error) throw error;
      const result: Record<string, Message> = {};
      for (const msg of (data || []) as Message[]) {
        if (!result[msg.channel_id]) result[msg.channel_id] = msg;
      }
      return result;
    },
    staleTime: 30_000,
  });

  const myChannels = channels.filter((ch) =>
    members.some((m) => m.channel_id === ch.id && m.user_id === userId)
  );

  const { data: unreadCounts = {}, refetch: refetchUnread } = useQuery({
    queryKey: ["internal-chat-unread", companyId, userId],
    enabled: !!companyId && !!userId,
    queryFn: async () => {
      const { data: myMemberships } = await supabase
        .from("internal_chat_members")
        .select("channel_id, last_read_at")
        .eq("user_id", userId!).eq("company_id", companyId!);
      if (!myMemberships?.length) return {} as Record<string, number>;
      const counts: Record<string, number> = {};
      await Promise.all(myMemberships.map(async (m) => {
        let q = supabase
          .from("internal_chat_messages")
          .select("id", { count: "exact", head: true })
          .eq("channel_id", m.channel_id)
          .neq("sender_id", userId!);
        if (m.last_read_at) q = q.gt("created_at", m.last_read_at);
        const { count } = await q;
        if (count && count > 0) counts[m.channel_id] = count;
      }));
      return counts;
    },
    staleTime: 15_000,
    refetchInterval: 60_000,
  });

  const markChannelRead = useCallback(async (channelId: string) => {
    if (!userId) return;
    await supabase.from("internal_chat_members")
      .update({ last_read_at: new Date().toISOString() })
      .eq("channel_id", channelId).eq("user_id", userId);
    refetchUnread();
  }, [userId, refetchUnread]);

  return { channels: myChannels, allChannels: channels, members, profiles, companyId, userId, queryClient, unreadCounts, markChannelRead, refetchUnread, lastMessages };
}

function useChannelMessages(channelId: string | null, onNewMessage?: () => void) {
  const queryClient = useQueryClient();
  const { data: messages = [], isError, refetch } = useQuery({
    queryKey: ["internal-chat-messages", channelId],
    enabled: !!channelId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("internal_chat_messages").select("*")
        .eq("channel_id", channelId!)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return data as Message[];
    },
    retry: 2,
  });

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
        queryClient.invalidateQueries({ queryKey: ["internal-chat-last-messages"] });
        onNewMessage?.();
      })
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [channelId, queryClient, onNewMessage]);

  return { messages, isError, refetch };
}

// ─── Chat List Item ──────────────────────────────────────────────────────────
function ChatListItem({
  channel, isActive, unread, lastMsg, profileMap, userId, members, onClick,
}: {
  channel: Channel; isActive: boolean; unread: number;
  lastMsg?: Message; profileMap: Map<string, Profile>;
  userId?: string; members: ChannelMember[]; onClick: () => void;
}) {
  const isLucia = !!channel.is_system || channel.name.toLowerCase().includes("lucia");
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
    ? (lastMsg.sender_id === userId ? "Tu: " : lastMsg.sender_id === LUCIA_SENDER_ID ? "Lucia: " : `${lastMsgSender?.first_name ?? ""}: `)
      + lastMsg.content.slice(0, 50) + (lastMsg.content.length > 50 ? "…" : "")
    : isDm ? "Inizia a chattare" : "Nessun messaggio";

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-3 py-3 flex items-center gap-3 transition-all border-b border-border/40",
        isActive
          ? "bg-[#f0f2f5] dark:bg-white/10"
          : "hover:bg-[#f5f6f6] dark:hover:bg-white/5",
      )}
    >
      {/* Avatar */}
      <div className="relative shrink-0">
        {isLucia ? (
          <div className="h-12 w-12 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <Bot className="h-6 w-6 text-white" />
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
          <span className={cn("text-[15px] truncate", unread > 0 ? "font-semibold text-foreground" : "font-normal text-foreground")}>
            {displayName}
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
            {!isDm && !isLucia && (
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
    </button>
  );
}

// ─── Message Bubble ──────────────────────────────────────────────────────────
function MessageBubble({
  msg, isMe, isLucia, sender, showAvatar, replyMsg, profileMap,
  onReply, onPin, onReaction, userId,
}: {
  msg: Message; isMe: boolean; isLucia: boolean;
  sender: Profile | undefined; showAvatar: boolean;
  replyMsg: Message | null; profileMap: Map<string, Profile>;
  onReply: () => void; onPin: () => void;
  onReaction: (emoji: string) => void; userId?: string;
}) {
  const replySender = replyMsg ? profileMap.get(replyMsg.sender_id) : undefined;

  return (
    <div className={cn("group flex mb-1", isMe ? "justify-end" : "justify-start", showAvatar && "mt-3")}>
      {/* Left avatar for others */}
      {!isMe && (
        <div className="w-8 shrink-0 self-end mr-1">
          {showAvatar && (
            isLucia ? (
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
        {/* Bubble */}
        <div
          className={cn(
            "rounded-lg px-3 py-1.5 shadow-sm relative",
            isMe
              ? "bg-[#d9fdd3] dark:bg-[#005c4b] text-foreground rounded-tr-none"
              : isLucia
                ? "bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950/40 dark:to-purple-950/40 border border-violet-200/50 dark:border-violet-800/30 rounded-tl-none"
                : "bg-white dark:bg-[#202c33] text-foreground rounded-tl-none shadow",
          )}
        >
          {/* Sender name for group chats */}
          {showAvatar && !isMe && (
            <p className={cn(
              "text-[12px] font-semibold mb-0.5",
              isLucia ? "text-violet-600 dark:text-violet-400" : `text-[${userColor(msg.sender_id).replace('bg-', '')}]`,
            )} style={{ color: isLucia ? undefined : getColorHex(msg.sender_id) }}>
              {isLucia ? "Lucia AI ✨" : profileName(sender)}
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
            <div className="mb-1.5">
              {msg.attachment_name && /\.(jpg|jpeg|png|gif|webp)$/i.test(msg.attachment_name) ? (
                <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer" className="block">
                  <img
                    src={msg.attachment_url}
                    alt={msg.attachment_name}
                    className="rounded-lg max-w-full max-h-60 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </a>
              ) : (
                <a
                  href={msg.attachment_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] transition-colors",
                    isMe
                      ? "bg-[#c8edca] dark:bg-[#004a3d] hover:bg-[#b8ddb9]"
                      : "bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/15",
                  )}
                >
                  <Paperclip className="h-4 w-4 shrink-0 text-[#54656f]" />
                  <span className="truncate font-medium">{msg.attachment_name || "Allegato"}</span>
                </a>
              )}
            </div>
          )}

          {/* Content */}
          {msg.content && !(msg.attachment_url && msg.content === `📎 ${msg.attachment_name}`) && (
            isLucia ? (
              <p className="text-[14px] break-words leading-relaxed pr-14"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
            ) : (
              <p className="text-[14px] whitespace-pre-wrap break-words pr-14 leading-relaxed">
                {renderWithMentions(msg.content)}
              </p>
            )
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
                  onClick={() => onReaction(emoji)}
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
                <button className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700" title="Reagisci">
                  <Smile className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" align={isMe ? "start" : "end"} className="w-auto p-1.5">
                <div className="flex gap-1">
                  {QUICK_REACTIONS.map((emoji) => (
                    <button key={emoji} onClick={() => onReaction(emoji)}
                      className="text-lg hover:scale-125 transition-transform p-0.5 rounded">
                      {emoji}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <button onClick={onReply} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700" title="Rispondi">
              <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            <button onClick={onPin} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
              title={msg.is_pinned ? "Rimuovi pin" : "Pinna"}>
              {msg.is_pinned
                ? <PinOff className="h-3.5 w-3.5 text-amber-500" />
                : <Pin className="h-3.5 w-3.5 text-muted-foreground" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

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
  const {
    channels, allChannels, members, profiles, companyId, userId,
    queryClient, unreadCounts, markChannelRead, refetchUnread, lastMessages,
  } = useInternalChat(companyIdOverride);
  const permissions = usePermissions();

  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createDmOpen, setCreateDmOpen] = useState(false);
  const [newMsg, setNewMsg] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [luciaTyping, setLuciaTyping] = useState(false);
  const [msgSearch, setMsgSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [chatFilter, setChatFilter] = useState<"all" | "groups" | "dm">("all");
  const [showMobile, setShowMobile] = useState(false); // mobile: show chat panel
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const presenceRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const selectedChannel = channels.find((c) => c.id === selectedChannelId);
  const isLuciaChannel = !!selectedChannel && (
    selectedChannel.is_system === true || selectedChannel.name.toLowerCase().includes("lucia")
  );
  const { messages, isError: messagesError, refetch: retryMessages } = useChannelMessages(selectedChannelId, refetchUnread);

  const profileMap = useMemo(() => {
    const m = new Map(profiles.map((p) => [p.id, p]));
    m.set(LUCIA_SENDER_ID, { id: LUCIA_SENDER_ID, first_name: "Lucia", last_name: "AI", email: "lucia@ediliziacloud.internal" });
    return m;
  }, [profiles]);

  const channelMembers = useMemo(
    () => members.filter((m) => m.channel_id === selectedChannelId),
    [members, selectedChannelId],
  );

  // Channel selection
  const handleSelectChannel = useCallback((channelId: string) => {
    setSelectedChannelId(channelId);
    setReplyTo(null);
    setMsgSearch("");
    setShowSearch(false);
    setShowMobile(true);
    markChannelRead(channelId);
  }, [markChannelRead]);

  // Auto-select first channel on desktop
  useEffect(() => {
    if (!selectedChannelId && channels.length > 0 && window.innerWidth >= 768) {
      handleSelectChannel(channels[0].id);
    }
  }, [channels, selectedChannelId, handleSelectChannel]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

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
      queryClient.invalidateQueries({ queryKey: ["internal-chat-last-messages"] });
      refetchUnread();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Send to Lucia
  const sendToLucia = useCallback(async (messageText: string) => {
    if (!selectedChannelId || !companyId || !userId || !messageText.trim()) return;
    const { error: insertErr } = await supabase.from("internal_chat_messages").insert({
      channel_id: selectedChannelId, sender_id: userId, company_id: companyId,
      content: messageText.trim(), message_type: "text",
    });
    if (insertErr) {
      toast.error(`Errore invio: ${insertErr.message || insertErr.details || insertErr.hint || "errore sconosciuto"}`);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["internal-chat-messages", selectedChannelId] });
    await supabase.from("internal_chat_members").update({ last_read_at: new Date().toISOString() }).eq("channel_id", selectedChannelId).eq("user_id", userId);
    setLuciaTyping(true);
    try {
      const res = await supabase.functions.invoke("lucia-chat", {
        body: {
          message: messageText.trim(), user_id: userId, company_id: companyId,
          channel_id: selectedChannelId,
          user_permissions: {
            canViewOrders: permissions.canViewOrders, canViewCustomers: permissions.canViewCustomers,
            canViewBilling: permissions.canViewBilling, canViewPersone: permissions.canViewPersone,
            canViewWarehouse: permissions.canViewWarehouse, canViewCalendar: permissions.canViewCalendar,
            canViewDashboard: permissions.canViewDashboard, canViewCruscotto: permissions.canViewCruscotto,
            canViewCosts: permissions.canViewCosts, isAdmin: permissions.isAdmin,
          },
        },
      });
      if (res.error) {
        let errBody: any = null;
        try { const ctx = (res.error as any).context; if (ctx instanceof Response) errBody = await ctx.json(); } catch {}
        throw new Error(errBody?.error ?? errBody?.message ?? res.error.message ?? "Errore Lucia");
      }
      queryClient.invalidateQueries({ queryKey: ["internal-chat-messages", selectedChannelId] });
      queryClient.invalidateQueries({ queryKey: ["internal-chat-last-messages"] });
      refetchUnread();
    } catch (err: unknown) {
      toast.error(`Lucia: ${err instanceof Error ? err.message : "Errore comunicazione"}`);
    } finally {
      setLuciaTyping(false);
    }
  }, [selectedChannelId, companyId, userId, permissions, queryClient, refetchUnread]);

  // Create group channel
  const [channelName, setChannelName] = useState("");
  const [channelDesc, setChannelDesc] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

  const createChannelMutation = useMutation({
    mutationFn: async () => {
      if (!companyId || !userId) return;
      const { data: ch, error } = await supabase.from("internal_chat_channels").insert({
        company_id: companyId, name: channelName.trim(),
        description: channelDesc.trim() || null, type: "group", created_by: userId,
      }).select().single();
      if (error) throw error;
      const allMemberIds = [userId, ...selectedMembers.filter((id) => id !== userId)];
      const { error: mErr } = await supabase.from("internal_chat_members").insert(
        allMemberIds.map((uid) => ({
          channel_id: ch.id, user_id: uid, company_id: companyId,
          role: uid === userId ? "admin" : "member",
        }))
      );
      if (mErr) throw mErr;
      return ch.id;
    },
    onSuccess: (newId) => {
      queryClient.invalidateQueries({ queryKey: ["internal-chat-channels"] });
      queryClient.invalidateQueries({ queryKey: ["internal-chat-members"] });
      setCreateOpen(false); setChannelName(""); setChannelDesc(""); setSelectedMembers([]);
      if (newId) handleSelectChannel(newId);
      toast.success("Gruppo creato!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Create DM
  const createDm = useCallback(async (targetUserId: string) => {
    if (!companyId || !userId) return;
    // Check if DM already exists
    const existing = channels.find((ch) =>
      ch.is_dm && ch.dm_user_ids &&
      ch.dm_user_ids.includes(userId) && ch.dm_user_ids.includes(targetUserId)
    );
    if (existing) {
      handleSelectChannel(existing.id);
      setCreateDmOpen(false);
      return;
    }
    const target = profileMap.get(targetUserId);
    const me = profileMap.get(userId);
    const dmName = `${me?.first_name ?? ""} & ${target?.first_name ?? ""}`;
    const { data: ch, error } = await supabase.from("internal_chat_channels").insert({
      company_id: companyId, name: dmName, type: "dm", created_by: userId,
      is_dm: true, dm_user_ids: [userId, targetUserId],
    }).select().single();
    if (error) { toast.error(error.message); return; }
    await supabase.from("internal_chat_members").insert([
      { channel_id: ch.id, user_id: userId, company_id: companyId, role: "member" },
      { channel_id: ch.id, user_id: targetUserId, company_id: companyId, role: "member" },
    ]);
    queryClient.invalidateQueries({ queryKey: ["internal-chat-channels"] });
    queryClient.invalidateQueries({ queryKey: ["internal-chat-members"] });
    handleSelectChannel(ch.id);
    setCreateDmOpen(false);
    toast.success("Chat creata!");
  }, [companyId, userId, channels, profileMap, queryClient, handleSelectChannel]);

  const handleSend = useCallback(() => {
    if (!newMsg.trim()) return;
    if (isLuciaChannel) {
      const msg = newMsg.trim();
      setNewMsg(""); setReplyTo(null);
      sendToLucia(msg);
    } else {
      sendMutation.mutate();
    }
  }, [newMsg, isLuciaChannel, sendToLucia, sendMutation]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // ── File Attachment ──
  const attachInputRef = useRef<HTMLInputElement>(null);
  const [isAttaching, setIsAttaching] = useState(false);

  const handleAttachment = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedChannelId || !companyId || !userId) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error("File troppo grande (max 10 MB)");
      return;
    }

    setIsAttaching(true);
    try {
      const ext = file.name.split(".").pop() ?? "bin";
      const path = `${companyId}/${selectedChannelId}/${crypto.randomUUID()}.${ext}`;

      // Try chat-attachments bucket first, fallback to ticket-attachments
      let bucket = "chat-attachments";
      let uploadResult = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type });
      if (uploadResult.error) {
        bucket = "ticket-attachments";
        uploadResult = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type });
      }
      if (uploadResult.error) throw uploadResult.error;

      // Get signed URL (24h)
      const { data: signedData } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24);
      const attachUrl = signedData?.signedUrl ?? path;

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
      queryClient.invalidateQueries({ queryKey: ["internal-chat-last-messages"] });
      refetchUnread();
      toast.success(`Allegato inviato: ${file.name}`);
    } catch (err: any) {
      toast.error("Errore invio allegato", { description: err.message });
    } finally {
      setIsAttaching(false);
      if (attachInputRef.current) attachInputRef.current.value = "";
    }
  }, [selectedChannelId, companyId, userId, newMsg, replyTo, queryClient, refetchUnread]);

  const togglePin = useCallback(async (msgId: string, currentPinned: boolean) => {
    await supabase.from("internal_chat_messages").update({ is_pinned: !currentPinned }).eq("id", msgId);
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
    await supabase.from("internal_chat_messages").update({ reactions }).eq("id", msgId);
    queryClient.invalidateQueries({ queryKey: ["internal-chat-messages", selectedChannelId] });
  }, [userId, selectedChannelId, queryClient]);

  // Filter channels
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
    return list;
  }, [channels, chatFilter, searchQuery, userId, profileMap]);

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

  const chatDisplayName = selectedChannel?.is_dm
    ? profileName(getDmProfile(selectedChannel))
    : selectedChannel?.name ?? "";

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="h-[calc(100vh-200px)] md:h-[calc(100vh-120px)] flex overflow-hidden rounded-xl border shadow-sm bg-[#efeae2] dark:bg-gray-950">
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
              onClick={() => setCreateDmOpen(true)} title="Nuovo messaggio">
              <UserPlus className="h-5 w-5" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-[#54656f] dark:text-gray-400">
                  <Plus className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setCreateDmOpen(true)}>
                  <MessageCircle className="h-4 w-4 mr-2" /> Nuovo messaggio
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setCreateOpen(true)}>
                  <UsersRound className="h-4 w-4 mr-2" /> Nuovo gruppo
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Search */}
        <div className="px-2 py-1.5 bg-white dark:bg-[#111b21]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#54656f] dark:text-gray-500" />
            <Input
              placeholder="Cerca o inizia una nuova chat"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-9 rounded-lg bg-[#f0f2f5] dark:bg-[#202c33] border-0 text-sm placeholder:text-[#667781]"
            />
          </div>
        </div>

        {/* Filter tabs */}
        <div className="px-3 py-1.5 flex gap-2 bg-white dark:bg-[#111b21]">
          {(["all", "groups", "dm"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setChatFilter(f)}
              className={cn(
                "px-3 py-1 rounded-full text-[13px] font-medium transition-colors",
                chatFilter === f
                  ? "bg-[#00a884]/10 text-[#00a884] dark:bg-[#00a884]/20"
                  : "text-[#54656f] dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5",
              )}
            >
              {f === "all" ? "Tutte" : f === "groups" ? "Gruppi" : "Messaggi"}
            </button>
          ))}
        </div>

        {/* Chat List */}
        <ScrollArea className="flex-1">
          {filteredChannels.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <MessageCircle className="h-12 w-12 text-[#54656f]/30 mb-4" />
              <p className="text-[15px] text-[#54656f] dark:text-gray-400">
                {searchQuery ? "Nessun risultato" : "Nessuna chat"}
              </p>
              <p className="text-[13px] text-muted-foreground mt-1">
                Inizia una conversazione con un collega
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
            {/* Chat Header */}
            <div className={cn(
              "h-[60px] px-4 flex items-center justify-between shrink-0 border-b",
              isLuciaChannel
                ? "bg-gradient-to-r from-violet-500/10 to-purple-500/10 dark:from-violet-950/30 dark:to-purple-950/30"
                : "bg-[#f0f2f5] dark:bg-[#202c33]",
            )}>
              <div className="flex items-center gap-3 min-w-0">
                {/* Back button (mobile) */}
                <Button variant="ghost" size="icon" className="h-8 w-8 md:hidden shrink-0"
                  onClick={() => setShowMobile(false)}>
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                {/* Avatar */}
                {isLuciaChannel ? (
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0">
                    <Bot className="h-5 w-5 text-white" />
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
                    {isLuciaChannel && (
                      <Badge variant="secondary" className="gap-0.5 bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 border-0 text-[10px] px-1.5 py-0">
                        <Sparkles className="h-2.5 w-2.5" /> AI
                      </Badge>
                    )}
                  </h3>
                  <p className="text-[12px] text-[#667781] dark:text-gray-400 truncate">
                    {isLuciaChannel
                      ? "Assistente AI aziendale"
                      : typingUsers.length > 0
                        ? `${typingUsers.join(", ")} sta scrivendo...`
                        : selectedChannel.is_dm
                          ? "Online"
                          : `${channelMembers.length} partecipanti`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-0.5">
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-[#54656f] dark:text-gray-400"
                  onClick={() => { setShowSearch((s) => !s); setMsgSearch(""); }}>
                  <Search className="h-5 w-5" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-[#54656f] dark:text-gray-400">
                      <MoreVertical className="h-5 w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setShowSearch(true)}>
                      <Search className="h-4 w-4 mr-2" /> Cerca nei messaggi
                    </DropdownMenuItem>
                    {!selectedChannel.is_dm && !isLuciaChannel && (
                      <DropdownMenuItem>
                        <Users className="h-4 w-4 mr-2" /> Info gruppo
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Search bar */}
            {showSearch && (
              <div className="px-4 py-2 bg-white dark:bg-[#1f2c34] border-b">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Cerca nei messaggi..."
                    value={msgSearch} onChange={(e) => setMsgSearch(e.target.value)}
                    className="pl-9 h-8 text-sm bg-[#f0f2f5] dark:bg-[#202c33] border-0"
                    autoFocus
                  />
                  <button onClick={() => { setShowSearch(false); setMsgSearch(""); }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2">
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

            {/* ═══ Messages ═══ */}
            <div
              ref={scrollAreaRef}
              className="flex-1 overflow-y-auto px-4 md:px-12 lg:px-16 py-4"
              style={{
                backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239C92AC' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
                backgroundColor: "#efeae2",
              }}
            >
              {messagesError ? (
                <div className="text-center py-12">
                  <p className="text-sm text-destructive mb-3">Errore nel caricamento.</p>
                  <Button variant="outline" size="sm" onClick={() => retryMessages()}>Riprova</Button>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  {isLuciaChannel ? (
                    <div className="max-w-sm text-center">
                      <div className="h-20 w-20 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mx-auto mb-4">
                        <Bot className="h-10 w-10 text-white" />
                      </div>
                      <p className="font-semibold text-lg mb-2">Ciao! Sono Lucia 👋</p>
                      <p className="text-sm text-muted-foreground mb-6">Il tuo assistente AI aziendale.</p>
                      <div className="space-y-2">
                        {["Come vanno gli ordini?", "Task in scadenza", "Chi è in cantiere oggi?"].map((s) => (
                          <button key={s} onClick={() => setNewMsg(s)}
                            className="w-full text-left text-sm border rounded-xl px-4 py-2.5 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm">
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-[#fcf4cb] dark:bg-yellow-900/20 rounded-lg px-4 py-3 shadow-sm max-w-md text-center">
                      <p className="text-[13px] text-[#54656f] dark:text-gray-300">
                        🔒 I messaggi in questa chat sono visibili solo ai partecipanti.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  {filteredMessages.map((msg, idx) => {
                    const isMe = msg.sender_id === userId;
                    const isLucia = msg.sender_id === LUCIA_SENDER_ID;
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
                          msg={msg} isMe={isMe} isLucia={isLucia} sender={sender}
                          showAvatar={showAvatar && !isMe && !selectedChannel?.is_dm}
                          replyMsg={replyMsg} profileMap={profileMap}
                          onReply={() => setReplyTo(msg)}
                          onPin={() => togglePin(msg.id, !!msg.is_pinned)}
                          onReaction={(emoji) => toggleReaction(msg.id, emoji, msg.reactions)}
                          userId={userId}
                        />
                      </React.Fragment>
                    );
                  })}
                  {/* Lucia typing */}
                  {luciaTyping && isLuciaChannel && (
                    <div className="flex justify-start mb-1 mt-3">
                      <div className="ml-9 bg-white dark:bg-[#202c33] rounded-lg rounded-tl-none px-4 py-3 shadow-sm">
                        <div className="flex items-center gap-2">
                          <div className="flex gap-1">
                            <span className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                            <span className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                            <span className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                          </div>
                          <span className="text-xs text-violet-500">Lucia sta pensando...</span>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Reply banner */}
            {replyTo && (
              <div className="px-4 py-2 bg-[#f0f2f5] dark:bg-[#1f2c34] border-t flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-1 h-10 rounded-full bg-[#00a884] shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold" style={{ color: getColorHex(replyTo.sender_id) }}>
                      {replyTo.sender_id === userId ? "Tu" : profileName(profileMap.get(replyTo.sender_id))}
                    </p>
                    <p className="text-[13px] text-[#667781] truncate">{replyTo.content.slice(0, 80)}</p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setReplyTo(null)}>
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

            {/* ═══ Compose Bar ═══ */}
            <div className={cn(
              "px-3 py-2 flex items-end gap-2 border-t",
              isLuciaChannel
                ? "bg-violet-50/50 dark:bg-violet-950/10"
                : "bg-[#f0f2f5] dark:bg-[#202c33]",
            )}>
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-[#54656f] shrink-0">
                <Smile className="h-6 w-6" />
              </Button>
              <Button variant="ghost" size="icon"
                className="h-9 w-9 rounded-full text-[#54656f] shrink-0"
                onClick={() => attachInputRef.current?.click()}
                disabled={isAttaching}
                title="Invia allegato"
              >
                {isAttaching ? <Loader2 className="h-5 w-5 animate-spin" /> : <Paperclip className="h-6 w-6" />}
              </Button>
              <input
                ref={attachInputRef}
                type="file"
                className="hidden"
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
                onChange={handleAttachment}
              />
              <div className="flex-1">
                <Input
                  placeholder={isLuciaChannel ? "Chiedi a Lucia..." : "Scrivi un messaggio"}
                  value={newMsg}
                  onChange={(e) => { setNewMsg(e.target.value); if (!isLuciaChannel) broadcastTyping(); }}
                  onKeyDown={handleKeyDown}
                  disabled={luciaTyping}
                  className={cn(
                    "h-10 rounded-lg border-0 text-[15px]",
                    isLuciaChannel
                      ? "bg-white dark:bg-[#2a3942] focus-visible:ring-violet-500"
                      : "bg-white dark:bg-[#2a3942]",
                  )}
                />
              </div>
              {newMsg.trim() ? (
                <Button
                  onClick={handleSend}
                  disabled={sendMutation.isPending || luciaTyping}
                  size="icon"
                  className={cn(
                    "h-10 w-10 rounded-full shrink-0",
                    isLuciaChannel
                      ? "bg-violet-600 hover:bg-violet-700"
                      : "bg-[#00a884] hover:bg-[#008f72]",
                  )}
                >
                  {luciaTyping ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                </Button>
              ) : (
                <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full text-[#54656f] shrink-0">
                  <Mic className="h-6 w-6" />
                </Button>
              )}
            </div>
          </>
        )}
      </div>

      {/* ═══ Create Group Dialog ═══ */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
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
              <ScrollArea className="h-[200px] border rounded-lg p-2 mt-1">
                {profiles.filter((p) => p.id !== userId).map((p) => (
                  <label key={p.id} className="flex items-center gap-3 py-2 px-2 hover:bg-gray-50 dark:hover:bg-white/5 rounded-lg cursor-pointer">
                    <Checkbox
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
      <Dialog open={createDmOpen} onOpenChange={setCreateDmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-[#00a884]" /> Nuovo Messaggio
            </DialogTitle>
          </DialogHeader>
          <div>
            <Label>Seleziona contatto</Label>
            <ScrollArea className="h-[300px] border rounded-lg p-1 mt-2">
              {profiles.filter((p) => p.id !== userId).map((p) => (
                <button
                  key={p.id}
                  onClick={() => createDm(p.id)}
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
    </div>
  );
}
