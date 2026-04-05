/**
 * Chat campo — lista canali dell'utente + messaggistica realtime.
 * Versione mobile-first, stile dark slate/amber.
 */
import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, isToday, isYesterday } from "date-fns";
import { it } from "date-fns/locale";
import {
  ArrowLeft, Hash, Send, Loader2, MessageCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Channel {
  id: string;
  name: string;
  description: string | null;
  type: string;
  channel_emoji?: string | null;
}

interface Message {
  id: string;
  channel_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  sender?: { first_name: string | null; last_name: string | null };
}

function formatMsgDate(iso: string) {
  const d = new Date(iso);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return "Ieri " + format(d, "HH:mm");
  return format(d, "d MMM HH:mm", { locale: it });
}

export default function CampoChat() {
  const { channelId } = useParams<{ channelId?: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [testo, setTesto] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // Lista canali dell'utente
  const { data: canali = [], isLoading: loadingCanali } = useQuery({
    queryKey: ["campo-chat-canali", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("chat_channel_members")
        .select("channel_id, channel:chat_channels(id, name, description, type, channel_emoji)")
        .eq("user_id", user!.id);
      return (data ?? []).map((m: any) => m.channel).filter(Boolean) as Channel[];
    },
    enabled: !!user?.id && !channelId,
  });

  // Messaggi del canale corrente
  const { data: messaggi = [], isLoading: loadingMsg } = useQuery({
    queryKey: ["campo-chat-msg", channelId],
    queryFn: async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select(`
          id, channel_id, sender_id, content, created_at,
          sender:profiles!chat_messages_sender_id_fkey(first_name, last_name)
        `)
        .eq("channel_id", channelId!)
        .order("created_at", { ascending: true })
        .limit(100);
      return (data ?? []) as Message[];
    },
    enabled: !!channelId && !!user?.id,
  });

  // Realtime subscription
  useEffect(() => {
    if (!channelId) return;
    const sub = supabase
      .channel(`campo-chat-${channelId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `channel_id=eq.${channelId}` },
        () => { qc.invalidateQueries({ queryKey: ["campo-chat-msg", channelId] }); }
      )
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [channelId, qc]);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messaggi]);

  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      const { error } = await supabase.from("chat_messages").insert({
        channel_id: channelId!,
        sender_id: user!.id,
        content,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setTesto("");
      qc.invalidateQueries({ queryKey: ["campo-chat-msg", channelId] });
    },
    onError: () => toast.error("Errore nell'invio del messaggio"),
  });

  const handleSend = () => {
    const t = testo.trim();
    if (!t) return;
    sendMutation.mutate(t);
  };

  const currentChannel = channelId
    ? canali.find(c => c.id === channelId) ?? { id: channelId, name: "Canale", description: null, type: "cantiere" }
    : null;

  // Single channel view
  if (channelId) {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate("/campo/chat")}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-800 active:bg-slate-700 shrink-0"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <Hash className="w-4 h-4 text-slate-400" />
          <div>
            <p className="font-bold text-white">{currentChannel?.name ?? "Canale"}</p>
            {currentChannel?.description && (
              <p className="text-xs text-slate-400">{currentChannel.description}</p>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {loadingMsg ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
            </div>
          ) : messaggi.length === 0 ? (
            <div className="flex flex-col items-center py-16 gap-3">
              <MessageCircle className="w-10 h-10 text-slate-700" />
              <p className="text-slate-400 text-sm">Nessun messaggio. Inizia la conversazione!</p>
            </div>
          ) : (
            messaggi.map((msg) => {
              const isMe = msg.sender_id === user?.id;
              const senderName = msg.sender
                ? [msg.sender.first_name, msg.sender.last_name].filter(Boolean).join(" ")
                : "Utente";
              return (
                <div key={msg.id} className={cn("flex gap-2", isMe ? "flex-row-reverse" : "flex-row")}>
                  {!isMe && (
                    <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center shrink-0 mt-1">
                      <span className="text-[10px] font-bold text-slate-300">
                        {senderName[0]?.toUpperCase() ?? "?"}
                      </span>
                    </div>
                  )}
                  <div className={cn("max-w-[75%]", isMe ? "items-end" : "items-start", "flex flex-col gap-0.5")}>
                    {!isMe && (
                      <span className="text-[10px] text-slate-500 ml-1">{senderName}</span>
                    )}
                    <div className={cn(
                      "px-3 py-2 rounded-2xl text-sm",
                      isMe
                        ? "bg-amber-500 text-black rounded-tr-sm"
                        : "bg-slate-800 text-white rounded-tl-sm"
                    )}>
                      {msg.content}
                    </div>
                    <span className="text-[10px] text-slate-600 mx-1">
                      {formatMsgDate(msg.created_at)}
                    </span>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div
          className="bg-slate-900 border-t border-slate-800 px-4 pt-3"
          style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
        >
          <div className="flex items-center gap-2">
            <input
              value={testo}
              onChange={e => setTesto(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Scrivi un messaggio..."
              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
            />
            <button
              onClick={handleSend}
              disabled={!testo.trim() || sendMutation.isPending}
              className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center disabled:opacity-40 active:scale-95 transition-transform shrink-0"
            >
              {sendMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin text-black" />
              ) : (
                <Send className="w-4 h-4 text-black" />
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Channel list view
  return (
    <div className="flex flex-col h-full overflow-y-auto px-4 py-4 space-y-3">
      <p className="text-xs text-slate-500 uppercase tracking-wide">I tuoi canali</p>

      {loadingCanali ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
        </div>
      ) : canali.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3 text-center">
          <MessageCircle className="w-10 h-10 text-slate-700" />
          <p className="text-slate-400 text-sm">Nessun canale disponibile</p>
          <p className="text-slate-600 text-xs">Verrai aggiunto automaticamente al canale del cantiere</p>
        </div>
      ) : (
        canali.map(c => (
          <button
            key={c.id}
            onClick={() => navigate(`/campo/chat/${c.id}`)}
            className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-left flex items-center gap-3 active:scale-[0.98] transition-transform"
          >
            <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center shrink-0">
              {c.channel_emoji ? (
                <span className="text-lg">{c.channel_emoji}</span>
              ) : (
                <Hash className="w-4 h-4 text-slate-400" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-white truncate">{c.name}</p>
              {c.description && (
                <p className="text-xs text-slate-400 truncate">{c.description}</p>
              )}
            </div>
          </button>
        ))
      )}
    </div>
  );
}
