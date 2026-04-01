import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, isToday, isYesterday } from "date-fns";
import { it } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Hash, Plus, Send, Search, Users, MessageCircle, CornerDownRight, Bot, Sparkles, Loader2, Smile, X, Pin, PinOff,
} from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "🙏", "👏", "🔥", "✅", "😮"];

// --- Types ---
interface Channel {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  type: string;
  created_by: string;
  created_at: string;
  is_system?: boolean;
  is_dm?: boolean;
  channel_emoji?: string | null;
}

// Lucia bot sentinel ID (must match the edge function)
const LUCIA_SENDER_ID = "00000000-0000-0000-0000-000000000001";

// Escape raw HTML entities to prevent XSS, then apply safe markdown transforms
function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Safe inline markdown renderer for Lucia messages (always escape first)
function renderMarkdown(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-xs font-mono">$1</code>')
    .replace(/@(\w+)/g, '<span class="text-primary font-medium">@$1</span>')
    .replace(/\n/g, "<br/>");
}

// Highlight @mentions in plain text messages
function renderWithMentions(text: string): React.ReactNode {
  const parts = text.split(/(@\w[\w\s]*)/g);
  return parts.map((part, i) =>
    part.startsWith("@") ? (
      <span key={i} className="text-primary font-medium bg-primary/10 px-0.5 rounded">{part}</span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
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
  reactions?: Record<string, string[]> | null; // emoji → [userId, ...]
  message_type?: string;
  is_pinned?: boolean;
}

interface Profile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

// --- Hook ---
function useInternalChat() {
  const { user, effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const userId = user?.id;
  const queryClient = useQueryClient();

  const { data: channels = [] } = useQuery({
    queryKey: ["internal-chat-channels", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("internal_chat_channels")
        .select("*")
        .eq("company_id", companyId!)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as Channel[];
    },
  });

  const { data: members = [] } = useQuery({
    queryKey: ["internal-chat-members", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("internal_chat_members")
        .select("*")
        .eq("company_id", companyId!);
      if (error) throw error;
      return data as ChannelMember[];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["chat-profiles", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .eq("company_id", companyId!);
      if (error) throw error;
      return data as Profile[];
    },
  });

  const myChannels = channels.filter((ch) =>
    members.some((m) => m.channel_id === ch.id && m.user_id === userId)
  );

  // Real unread count per channel
  const { data: unreadCounts = {}, refetch: refetchUnread } = useQuery({
    queryKey: ["internal-chat-unread", companyId, userId],
    enabled: !!companyId && !!userId,
    queryFn: async () => {
      const { data: myMemberships } = await supabase
        .from("internal_chat_members")
        .select("channel_id, last_read_at")
        .eq("user_id", userId!)
        .eq("company_id", companyId!);
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
      .eq("channel_id", channelId)
      .eq("user_id", userId);
    refetchUnread();
  }, [userId, refetchUnread]);

  return { channels: myChannels, allChannels: channels, members, profiles, companyId, userId, queryClient, unreadCounts, markChannelRead, refetchUnread };
}

function useChannelMessages(channelId: string | null, onNewMessage?: () => void) {
  const queryClient = useQueryClient();

  const { data: messages = [], isError, refetch } = useQuery({
    queryKey: ["internal-chat-messages", channelId],
    enabled: !!channelId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("internal_chat_messages")
        .select("*")
        .eq("channel_id", channelId!)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return data as Message[];
    },
    retry: 2,
  });

  // Realtime subscription
  useEffect(() => {
    if (!channelId) return;
    const sub = supabase
      .channel(`chat-${channelId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "internal_chat_messages",
        filter: `channel_id=eq.${channelId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ["internal-chat-messages", channelId] });
        onNewMessage?.();
      })
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  }, [channelId, queryClient, onNewMessage]);

  return { messages, isError, refetch };
}

// --- Formatters ---
function formatMsgTime(dateStr: string) {
  const d = new Date(dateStr);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return "Ieri " + format(d, "HH:mm");
  return format(d, "dd/MM HH:mm");
}

function initials(p: Profile | undefined) {
  if (!p) return "?";
  return `${p.first_name?.[0] || ""}${p.last_name?.[0] || ""}`.toUpperCase();
}

function profileName(p: Profile | undefined) {
  if (!p) return "Sconosciuto";
  return `${p.first_name} ${p.last_name}`;
}

// --- Main Component ---
export default function InternalChat() {
  const { channels, allChannels, members, profiles, companyId, userId, queryClient, unreadCounts, markChannelRead, refetchUnread } = useInternalChat();
  const permissions = usePermissions();
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newMsg, setNewMsg] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [luciaTyping, setLuciaTyping] = useState(false);
  const [msgSearch, setMsgSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const presenceRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedChannel = channels.find((c) => c.id === selectedChannelId);
  const isLuciaChannel = !!selectedChannel && (
    selectedChannel.is_system === true ||
    selectedChannel.name.toLowerCase().includes("lucia") ||
    selectedChannel.name.toLowerCase().includes("lucia-ai")
  );
  const { messages, isError: messagesError, refetch: retryMessages } = useChannelMessages(selectedChannelId, refetchUnread);
  const channelMembers = useMemo(
    () => members.filter((m) => m.channel_id === selectedChannelId),
    [members, selectedChannelId]
  );

  // Memoize profileMap — rebuilt only when profiles change
  const profileMap = useMemo(() => {
    const m = new Map(profiles.map((p) => [p.id, p]));
    m.set(LUCIA_SENDER_ID, {
      id: LUCIA_SENDER_ID,
      first_name: "Lucia",
      last_name: "AI",
      email: "lucia@ediliziacloud.internal",
    });
    return m;
  }, [profiles]);

  // Declare handleSelectChannel BEFORE the useEffect that depends on it
  const handleSelectChannel = useCallback((channelId: string) => {
    setSelectedChannelId(channelId);
    setReplyTo(null);       // clear pending reply when switching channels
    setMsgSearch("");       // clear message search
    setShowSearch(false);
    markChannelRead(channelId);
  }, [markChannelRead]);

  // Auto-select first channel
  useEffect(() => {
    if (!selectedChannelId && channels.length > 0) {
      handleSelectChannel(channels[0].id);
    }
  }, [channels, selectedChannelId, handleSelectChannel]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Typing indicator via Supabase Presence
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
    // Use profiles array directly to avoid stale profileMap reference
    const profile = profiles.find((p) => p.id === userId);
    presenceRef.current.track({ typing: true, name: profile?.first_name ?? "Qualcuno" });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      presenceRef.current?.track({ typing: false, name: "" });
    }, 3000);
  }, [userId, profiles]);

  // Parse @mentions from message content → returns array of user IDs
  const parseMentions = useCallback((content: string): string[] => {
    const mentionRegex = /@([\w]+(?:\s+[\w]+)?)/g;
    const mentioned: string[] = [];
    let match;
    while ((match = mentionRegex.exec(content)) !== null) {
      const nameQuery = match[1].toLowerCase();
      // Try to match against profiles
      for (const p of profiles) {
        const fullName = `${p.first_name} ${p.last_name}`.toLowerCase();
        const firstName = p.first_name.toLowerCase();
        if (fullName.startsWith(nameQuery) || firstName === nameQuery) {
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
        channel_id: selectedChannelId,
        sender_id: userId,
        company_id: companyId,
        content: newMsg.trim(),
        reply_to_id: replyTo?.id || null,
        mentions: mentionedIds.length > 0 ? mentionedIds : null,
      });
      if (error) throw error;
      // Update channel timestamp
      await supabase.from("internal_chat_channels").update({ updated_at: new Date().toISOString() }).eq("id", selectedChannelId);
      // Update last_read_at
      await supabase.from("internal_chat_members").update({ last_read_at: new Date().toISOString() }).eq("channel_id", selectedChannelId).eq("user_id", userId);
    },
    onSuccess: () => {
      setNewMsg("");
      setReplyTo(null);
      queryClient.invalidateQueries({ queryKey: ["internal-chat-messages", selectedChannelId] });
      queryClient.invalidateQueries({ queryKey: ["internal-chat-channels"] });
      refetchUnread();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Send to Lucia AI
  const sendToLucia = useCallback(async (messageText: string) => {
    if (!selectedChannelId || !companyId || !userId || !messageText.trim()) return;
    // First save user message to channel
    await supabase.from("internal_chat_messages").insert({
      channel_id: selectedChannelId,
      sender_id: userId,
      company_id: companyId,
      content: messageText.trim(),
      message_type: "text",
    });
    queryClient.invalidateQueries({ queryKey: ["internal-chat-messages", selectedChannelId] });
    // Update last_read_at
    await supabase.from("internal_chat_members").update({ last_read_at: new Date().toISOString() }).eq("channel_id", selectedChannelId).eq("user_id", userId);

    setLuciaTyping(true);
    try {
      const res = await supabase.functions.invoke("lucia-chat", {
        body: {
          message: messageText.trim(),
          user_id: userId,
          company_id: companyId,
          channel_id: selectedChannelId,
          user_permissions: {
            canViewOrders: permissions.canViewOrders,
            canViewCustomers: permissions.canViewCustomers,
            canViewBilling: permissions.canViewBilling,
            canViewPersone: permissions.canViewPersone,
            canViewWarehouse: permissions.canViewWarehouse,
            canViewCalendar: permissions.canViewCalendar,
            canViewDashboard: permissions.canViewDashboard,
            canViewCruscotto: permissions.canViewCruscotto,
            canViewCosts: permissions.canViewCosts,
            isAdmin: permissions.isAdmin,
          },
        },
      });
      if (res.error) throw new Error(res.error.message);
      queryClient.invalidateQueries({ queryKey: ["internal-chat-messages", selectedChannelId] });
      refetchUnread();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Errore comunicazione con Lucia";
      toast.error(`Lucia: ${msg}`);
    } finally {
      setLuciaTyping(false);
    }
  }, [selectedChannelId, companyId, userId, permissions, queryClient, refetchUnread]);

  // Create channel
  const [channelName, setChannelName] = useState("");
  const [channelDesc, setChannelDesc] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

  const createChannelMutation = useMutation({
    mutationFn: async () => {
      if (!companyId || !userId) return;
      const { data: ch, error } = await supabase.from("internal_chat_channels").insert({
        company_id: companyId,
        name: channelName.trim(),
        description: channelDesc.trim() || null,
        type: "group",
        created_by: userId,
      }).select().single();
      if (error) throw error;

      // Add creator + selected members
      const allMemberIds = [userId, ...selectedMembers.filter((id) => id !== userId)];
      const membersToInsert = allMemberIds.map((uid) => ({
        channel_id: ch.id,
        user_id: uid,
        company_id: companyId,
        role: uid === userId ? "admin" : "member",
      }));
      const { error: mErr } = await supabase.from("internal_chat_members").insert(membersToInsert);
      if (mErr) throw mErr;
      return ch.id;
    },
    onSuccess: (newId) => {
      queryClient.invalidateQueries({ queryKey: ["internal-chat-channels"] });
      queryClient.invalidateQueries({ queryKey: ["internal-chat-members"] });
      setCreateOpen(false);
      setChannelName("");
      setChannelDesc("");
      setSelectedMembers([]);
      if (newId) setSelectedChannelId(newId);
      toast.success("Canale creato");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filteredChannels = useMemo(
    () => channels.filter((c) => c.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [channels, searchQuery]
  );

  const filteredMessages = useMemo(
    () => msgSearch.trim()
      ? messages.filter((m) => m.content.toLowerCase().includes(msgSearch.toLowerCase()))
      : messages,
    [messages, msgSearch]
  );

  const handleSend = useCallback(() => {
    if (!newMsg.trim()) return;
    if (isLuciaChannel) {
      const msg = newMsg.trim();
      setNewMsg("");
      setReplyTo(null);
      sendToLucia(msg);
    } else {
      sendMutation.mutate();
    }
  }, [newMsg, isLuciaChannel, sendToLucia, sendMutation]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const togglePin = useCallback(async (msgId: string, currentPinned: boolean) => {
    await supabase.from("internal_chat_messages").update({ is_pinned: !currentPinned }).eq("id", msgId);
    queryClient.invalidateQueries({ queryKey: ["internal-chat-messages", selectedChannelId] });
    toast.success(currentPinned ? "Messaggio rimosso dai pinnati" : "Messaggio pinnato");
  }, [selectedChannelId, queryClient]);

  const toggleReaction = useCallback(async (msgId: string, emoji: string, currentReactions: Record<string, string[]> | null | undefined) => {
    if (!userId) return;
    const reactions = { ...(currentReactions ?? {}) };
    const users = reactions[emoji] ?? [];
    if (users.includes(userId)) {
      // Remove reaction
      reactions[emoji] = users.filter((u) => u !== userId);
      if (reactions[emoji].length === 0) delete reactions[emoji];
    } else {
      // Add reaction
      reactions[emoji] = [...users, userId];
    }
    await supabase.from("internal_chat_messages").update({ reactions }).eq("id", msgId);
    queryClient.invalidateQueries({ queryKey: ["internal-chat-messages", selectedChannelId] });
  }, [userId, selectedChannelId, queryClient]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Chat Interna</h1>
          <p className="text-muted-foreground">Comunica con il tuo team in tempo reale</p>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-0 border rounded-lg overflow-hidden bg-card h-[calc(100vh-200px)]">
        {/* Sidebar - Channel List */}
        <div className="col-span-3 border-r flex flex-col">
          <div className="p-3 border-b space-y-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cerca canale..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              <Button size="icon" variant="outline" className="h-9 w-9" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <ScrollArea className="flex-1">
            {filteredChannels.length === 0 ? (
              <div className="p-4 text-center">
                <MessageCircle className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Nessun canale</p>
                <Button size="sm" variant="outline" className="mt-2" onClick={() => setCreateOpen(true)}>
                  <Plus className="h-3 w-3 mr-1" /> Crea canale
                </Button>
              </div>
            ) : (
              filteredChannels.map((ch) => {
                const isActive = ch.id === selectedChannelId;
                const memberCount = members.filter((m) => m.channel_id === ch.id).length;
                const unread = unreadCounts[ch.id] ?? 0;
                const isLucia = ch.is_system || ch.name.toLowerCase().includes("lucia");
                return (
                  <button
                    key={ch.id}
                    onClick={() => handleSelectChannel(ch.id)}
                    className={`w-full text-left px-3 py-2.5 flex items-center gap-3 transition-colors border-b ${
                      isActive ? "bg-primary/5 border-l-2 border-l-primary" : "hover:bg-muted/50"
                    }`}
                  >
                    <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${isLucia ? "bg-gradient-to-br from-violet-500 to-purple-600" : "bg-primary/10"}`}>
                      {isLucia ? <Bot className="h-4 w-4 text-white" /> : <Hash className="h-4 w-4 text-primary" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm truncate ${isActive ? "font-semibold" : unread > 0 ? "font-semibold" : "font-medium"}`}>{ch.name}</p>
                      <p className="text-xs text-muted-foreground">{memberCount} membri</p>
                    </div>
                    {!isActive && unread > 0 && (
                      <span className="shrink-0 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                        {unread > 99 ? "99+" : unread}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </ScrollArea>
        </div>

        {/* Main Chat Area */}
        <div className="col-span-9 flex flex-col">
          {!selectedChannel ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>Seleziona un canale o creane uno nuovo</p>
              </div>
            </div>
          ) : (
            <>
              {/* Channel Header */}
              <div className={`px-4 py-3 border-b flex items-center justify-between ${isLuciaChannel ? "bg-gradient-to-r from-violet-500/5 to-purple-500/5" : ""}`}>
                <div className="flex items-center gap-2">
                  {isLuciaChannel ? (
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                      <Bot className="h-4 w-4 text-white" />
                    </div>
                  ) : (
                    <Hash className="h-5 w-5 text-primary" />
                  )}
                  <h3 className="font-semibold">{selectedChannel.name}</h3>
                  {isLuciaChannel && (
                    <Badge variant="secondary" className="gap-1 bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 border-0">
                      <Sparkles className="h-2.5 w-2.5" /> AI
                    </Badge>
                  )}
                  {!isLuciaChannel && selectedChannel.description && (
                    <span className="text-xs text-muted-foreground hidden md:inline">— {selectedChannel.description}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => { setShowSearch((s) => !s); setMsgSearch(""); }}
                    title="Cerca nei messaggi"
                  >
                    <Search className="h-3.5 w-3.5" />
                  </Button>
                  {isLuciaChannel ? (
                    <span className="text-xs text-muted-foreground">AI</span>
                  ) : (
                    <Badge variant="secondary" className="gap-1">
                      <Users className="h-3 w-3" />
                      {channelMembers.length}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Message search bar */}
              {showSearch && (
                <div className="px-4 py-2 border-b bg-muted/20">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Cerca nei messaggi..."
                      value={msgSearch}
                      onChange={(e) => setMsgSearch(e.target.value)}
                      className="pl-8 h-8 text-sm"
                      autoFocus
                    />
                    {msgSearch && (
                      <button onClick={() => setMsgSearch("")} className="absolute right-2.5 top-2.5">
                        <X className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                  {msgSearch && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {filteredMessages.length} risultati per "{msgSearch}"
                    </p>
                  )}
                </div>
              )}

              {/* Messages */}
              <ScrollArea className="flex-1 px-4 py-3">
                {messagesError ? (
                  <div className="text-center text-muted-foreground py-12">
                    <p className="text-sm text-destructive mb-3">Errore nel caricamento dei messaggi.</p>
                    <Button variant="outline" size="sm" onClick={() => retryMessages()}>Riprova</Button>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center text-muted-foreground py-12">
                    {isLuciaChannel ? (
                      <div className="max-w-sm mx-auto">
                        <div className="h-16 w-16 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mx-auto mb-4">
                          <Bot className="h-8 w-8 text-white" />
                        </div>
                        <p className="font-semibold text-foreground mb-2">Ciao! Sono Lucia 👋</p>
                        <p className="text-sm mb-4">Il tuo assistente virtuale aziendale. Posso aiutarti con ordini, task, clienti, KPI e molto altro.</p>
                        <div className="text-left space-y-1.5">
                          {["Come vanno gli ordini questo mese?", "Mostrami i task in scadenza", "Chi è in cantiere oggi?", "Crea un task per domani"].map((suggestion) => (
                            <button
                              key={suggestion}
                              onClick={() => { setNewMsg(suggestion); }}
                              className="w-full text-left text-xs border rounded-lg px-3 py-2 hover:bg-muted/50 transition-colors"
                            >
                              {suggestion}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm">Nessun messaggio. Inizia la conversazione!</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredMessages.map((msg, idx) => {
                      const sender = profileMap.get(msg.sender_id);
                      const isMe = msg.sender_id === userId;
                      const isLucia = msg.sender_id === LUCIA_SENDER_ID;
                      const prevMsg = filteredMessages[idx - 1];
                      const showAvatar = !prevMsg || prevMsg.sender_id !== msg.sender_id;
                      // Always search full messages, not filtered subset (avoids missing reply previews)
                      const replyMsg = msg.reply_to_id ? messages.find((m) => m.id === msg.reply_to_id) : null;
                      const isHighlighted = msgSearch && msg.content.toLowerCase().includes(msgSearch.toLowerCase());

                      return (
                        <div
                          key={msg.id}
                          className={`group flex gap-3 ${showAvatar ? "mt-4" : "mt-0.5"} ${isHighlighted ? "bg-yellow-50 dark:bg-yellow-950/20 -mx-2 px-2 py-0.5 rounded" : ""}`}
                        >
                          <div className="w-8 shrink-0">
                            {showAvatar && (
                              isLucia ? (
                                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0">
                                  <Bot className="h-4 w-4 text-white" />
                                </div>
                              ) : (
                                <Avatar className="h-8 w-8">
                                  <AvatarFallback className="text-xs bg-primary/10 text-primary">
                                    {initials(sender)}
                                  </AvatarFallback>
                                </Avatar>
                              )
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            {showAvatar && (
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className={`text-sm font-medium ${isMe ? "text-primary" : isLucia ? "text-violet-600 dark:text-violet-400" : ""}`}>
                                  {isMe ? "Tu" : isLucia ? "Lucia AI" : profileName(sender)}
                                </span>
                                <span className="text-xs text-muted-foreground">{formatMsgTime(msg.created_at)}</span>
                                {isLucia && <Sparkles className="h-3 w-3 text-violet-400" />}
                                {msg.is_edited && <span className="text-xs text-muted-foreground italic">(modificato)</span>}
                              </div>
                            )}
                            {replyMsg && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1 pl-2 border-l-2 border-primary/30">
                                <CornerDownRight className="h-3 w-3 shrink-0" />
                                <span className="truncate max-w-[300px] italic">{replyMsg.content.slice(0, 80)}{replyMsg.content.length > 80 ? "…" : ""}</span>
                              </div>
                            )}
                            {msg.is_pinned && (
                            <div className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 mb-0.5">
                              <Pin className="h-2.5 w-2.5" /> Pinnato
                            </div>
                          )}
                          <div className={`relative ${isLucia ? "bg-violet-50 dark:bg-violet-950/30 border border-violet-200/50 dark:border-violet-800/30 rounded-lg px-3 py-2" : ""} ${msg.is_pinned ? "border-l-2 border-amber-400 pl-2" : ""}`}>
                              {isLucia ? (
                                <p
                                  className="text-sm break-words leading-relaxed"
                                  dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                                />
                              ) : (
                                <p className="text-sm whitespace-pre-wrap break-words">{renderWithMentions(msg.content)}</p>
                              )}
                              {!isLucia && (
                                <div className="absolute -right-1 top-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <button className="p-1 rounded hover:bg-muted" title="Aggiungi reazione">
                                        <Smile className="h-3.5 w-3.5 text-muted-foreground" />
                                      </button>
                                    </PopoverTrigger>
                                    <PopoverContent side="top" align="end" className="w-auto p-1.5">
                                      <div className="flex gap-1">
                                        {QUICK_REACTIONS.map((emoji) => (
                                          <button
                                            key={emoji}
                                            onClick={() => toggleReaction(msg.id, emoji, msg.reactions)}
                                            className="text-lg hover:scale-125 transition-transform p-0.5 rounded"
                                          >
                                            {emoji}
                                          </button>
                                        ))}
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                  <button
                                    onClick={() => togglePin(msg.id, !!msg.is_pinned)}
                                    className="p-1 rounded hover:bg-muted"
                                    title={msg.is_pinned ? "Rimuovi pin" : "Pinna messaggio"}
                                  >
                                    {msg.is_pinned ? <PinOff className="h-3.5 w-3.5 text-amber-500" /> : <Pin className="h-3.5 w-3.5 text-muted-foreground" />}
                                  </button>
                                  <button
                                    onClick={() => setReplyTo(msg)}
                                    className="p-1 rounded hover:bg-muted"
                                    title="Rispondi"
                                  >
                                    <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground" />
                                  </button>
                                </div>
                              )}
                            </div>
                            {/* Reaction counters */}
                            {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {Object.entries(msg.reactions).map(([emoji, users]) =>
                                  users.length > 0 ? (
                                    <button
                                      key={emoji}
                                      onClick={() => toggleReaction(msg.id, emoji, msg.reactions)}
                                      className={`flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full border transition-colors ${
                                        users.includes(userId ?? "")
                                          ? "bg-primary/10 border-primary/30 text-primary"
                                          : "bg-muted border-border hover:bg-muted/80"
                                      }`}
                                    >
                                      <span>{emoji}</span>
                                      <span className="font-medium">{users.length}</span>
                                    </button>
                                  ) : null
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {luciaTyping && isLuciaChannel && (
                      <div className="flex gap-3 mt-4">
                        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0">
                          <Bot className="h-4 w-4 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-sm font-medium text-violet-600 dark:text-violet-400">Lucia AI</span>
                            <Sparkles className="h-3 w-3 text-violet-400" />
                          </div>
                          <div className="bg-violet-50 dark:bg-violet-950/30 border border-violet-200/50 rounded-lg px-3 py-2 inline-flex items-center gap-1.5">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500" />
                            <span className="text-xs text-violet-500">Lucia sta elaborando...</span>
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </ScrollArea>

              {/* Reply Banner */}
              {replyTo && (
                <div className="px-4 py-2 border-t bg-muted/30 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <CornerDownRight className="h-3 w-3" />
                    <span>Rispondendo a <strong>{profileName(profileMap.get(replyTo.sender_id))}</strong>:</span>
                    <span className="truncate max-w-[300px]">{replyTo.content}</span>
                  </div>
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setReplyTo(null)}>✕</Button>
                </div>
              )}

              {/* Compose */}
              <div className={`px-4 py-3 border-t ${isLuciaChannel ? "bg-violet-50/30 dark:bg-violet-950/10" : ""}`}>
                {isLuciaChannel && (
                  <p className="text-[10px] text-muted-foreground mb-2 flex items-center gap-1">
                    <Sparkles className="h-2.5 w-2.5 text-violet-400" />
                    Chiedi a Lucia informazioni su ordini, task, clienti, KPI e molto altro
                  </p>
                )}
                {typingUsers.length > 0 && !isLuciaChannel && (
                  <p className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
                    <span className="inline-flex gap-0.5">
                      <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "300ms" }} />
                    </span>
                    <span>{typingUsers.join(", ")} {typingUsers.length === 1 ? "sta" : "stanno"} scrivendo…</span>
                  </p>
                )}
                <div className="flex gap-2">
                  <Input
                    placeholder={isLuciaChannel ? "Chiedi qualcosa a Lucia..." : `Scrivi in #${selectedChannel.name}...`}
                    value={newMsg}
                    onChange={(e) => { setNewMsg(e.target.value); if (!isLuciaChannel) broadcastTyping(); }}
                    onKeyDown={handleKeyDown}
                    disabled={luciaTyping}
                    className={`flex-1 ${isLuciaChannel ? "border-violet-200 dark:border-violet-800 focus-visible:ring-violet-500" : ""}`}
                  />
                  <Button
                    onClick={handleSend}
                    disabled={!newMsg.trim() || sendMutation.isPending || luciaTyping}
                    size="icon"
                    className={isLuciaChannel ? "bg-violet-600 hover:bg-violet-700" : ""}
                  >
                    {luciaTyping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Create Channel Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nuovo Canale</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome canale</Label>
              <Input value={channelName} onChange={(e) => setChannelName(e.target.value)} placeholder="es. generale, progetto-xyz" />
            </div>
            <div>
              <Label>Descrizione</Label>
              <Input value={channelDesc} onChange={(e) => setChannelDesc(e.target.value)} placeholder="Opzionale" />
            </div>
            <div>
              <Label>Membri</Label>
              <ScrollArea className="h-[180px] border rounded-md p-2 mt-1">
                {profiles.filter((p) => p.id !== userId).map((p) => (
                  <label key={p.id} className="flex items-center gap-2 py-1.5 px-1 hover:bg-muted rounded cursor-pointer">
                    <Checkbox
                      checked={selectedMembers.includes(p.id)}
                      onCheckedChange={(checked) => {
                        setSelectedMembers((prev) =>
                          checked ? [...prev, p.id] : prev.filter((id) => id !== p.id)
                        );
                      }}
                    />
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className="text-xs">{initials(p)}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm">{p.first_name} {p.last_name}</span>
                  </label>
                ))}
              </ScrollArea>
              <p className="text-xs text-muted-foreground mt-1">Tu sarai aggiunto automaticamente come admin</p>
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={!channelName.trim() || createChannelMutation.isPending}
              onClick={() => createChannelMutation.mutate()}
            >
              Crea Canale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
