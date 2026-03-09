import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, isToday, isYesterday } from "date-fns";
import { it } from "date-fns/locale";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Hash, Plus, Send, Search, Users, MessageCircle, Crown, CornerDownRight,
} from "lucide-react";

// --- Types ---
interface Channel {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  type: string;
  created_by: string;
  created_at: string;
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

  return { channels: myChannels, allChannels: channels, members, profiles, companyId, userId, queryClient };
}

function useChannelMessages(channelId: string | null) {
  const queryClient = useQueryClient();

  const { data: messages = [] } = useQuery({
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
      })
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  }, [channelId, queryClient]);

  return messages;
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
  const { channels, allChannels, members, profiles, companyId, userId, queryClient } = useInternalChat();
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newMsg, setNewMsg] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedChannel = channels.find((c) => c.id === selectedChannelId);
  const messages = useChannelMessages(selectedChannelId);
  const channelMembers = members.filter((m) => m.channel_id === selectedChannelId);
  const profileMap = new Map(profiles.map((p) => [p.id, p]));

  // Auto-select first channel
  useEffect(() => {
    if (!selectedChannelId && channels.length > 0) {
      setSelectedChannelId(channels[0].id);
    }
  }, [channels, selectedChannelId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Send message
  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!selectedChannelId || !companyId || !userId || !newMsg.trim()) return;
      const { error } = await supabase.from("internal_chat_messages").insert({
        channel_id: selectedChannelId,
        sender_id: userId,
        company_id: companyId,
        content: newMsg.trim(),
        reply_to_id: replyTo?.id || null,
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
    },
    onError: (e: Error) => toast.error(e.message),
  });

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

  const filteredChannels = channels.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Unread count per channel
  const getUnreadCount = useCallback((channelId: string) => {
    const myMembership = members.find((m) => m.channel_id === channelId && m.user_id === userId);
    if (!myMembership?.last_read_at) return 0;
    // We don't have per-channel message counts here, simplified
    return 0;
  }, [members, userId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (newMsg.trim()) sendMutation.mutate();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Chat Interna</h1>
          <p className="text-muted-foreground">Comunica con il tuo team in tempo reale</p>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-0 border rounded-lg overflow-hidden bg-card" style={{ height: "calc(100vh - 200px)" }}>
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
                return (
                  <button
                    key={ch.id}
                    onClick={() => setSelectedChannelId(ch.id)}
                    className={`w-full text-left px-3 py-2.5 flex items-center gap-3 transition-colors border-b ${
                      isActive ? "bg-primary/5 border-l-2 border-l-primary" : "hover:bg-muted/50"
                    }`}
                  >
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Hash className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm truncate ${isActive ? "font-semibold" : "font-medium"}`}>{ch.name}</p>
                      <p className="text-xs text-muted-foreground">{memberCount} membri</p>
                    </div>
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
              <div className="px-4 py-3 border-b flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Hash className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">{selectedChannel.name}</h3>
                  {selectedChannel.description && (
                    <span className="text-xs text-muted-foreground hidden md:inline">— {selectedChannel.description}</span>
                  )}
                </div>
                <Badge variant="secondary" className="gap-1">
                  <Users className="h-3 w-3" />
                  {channelMembers.length}
                </Badge>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 px-4 py-3">
                {messages.length === 0 ? (
                  <div className="text-center text-muted-foreground py-12">
                    <p className="text-sm">Nessun messaggio. Inizia la conversazione!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {messages.map((msg, idx) => {
                      const sender = profileMap.get(msg.sender_id);
                      const isMe = msg.sender_id === userId;
                      const prevMsg = messages[idx - 1];
                      const showAvatar = !prevMsg || prevMsg.sender_id !== msg.sender_id;
                      const replyMsg = msg.reply_to_id ? messages.find((m) => m.id === msg.reply_to_id) : null;

                      return (
                        <div
                          key={msg.id}
                          className={`group flex gap-3 ${showAvatar ? "mt-4" : "mt-0.5"}`}
                        >
                          <div className="w-8 shrink-0">
                            {showAvatar && (
                              <Avatar className="h-8 w-8">
                                <AvatarFallback className="text-xs bg-primary/10 text-primary">
                                  {initials(sender)}
                                </AvatarFallback>
                              </Avatar>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            {showAvatar && (
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className={`text-sm font-medium ${isMe ? "text-primary" : ""}`}>
                                  {isMe ? "Tu" : profileName(sender)}
                                </span>
                                <span className="text-xs text-muted-foreground">{formatMsgTime(msg.created_at)}</span>
                                {msg.is_edited && <span className="text-xs text-muted-foreground italic">(modificato)</span>}
                              </div>
                            )}
                            {replyMsg && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1 pl-2 border-l-2 border-primary/30">
                                <CornerDownRight className="h-3 w-3" />
                                <span className="truncate max-w-[300px]">{replyMsg.content}</span>
                              </div>
                            )}
                            <div className="relative">
                              <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                              <button
                                onClick={() => setReplyTo(msg)}
                                className="absolute -right-1 top-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted"
                                title="Rispondi"
                              >
                                <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
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
              <div className="px-4 py-3 border-t">
                <div className="flex gap-2">
                  <Input
                    placeholder={`Scrivi in #${selectedChannel.name}...`}
                    value={newMsg}
                    onChange={(e) => setNewMsg(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="flex-1"
                  />
                  <Button
                    onClick={() => sendMutation.mutate()}
                    disabled={!newMsg.trim() || sendMutation.isPending}
                    size="icon"
                  >
                    <Send className="h-4 w-4" />
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
