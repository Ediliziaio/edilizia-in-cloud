/**
 * SilvioChatSheet — Chat embedded con Silvio dentro un Sheet laterale.
 *
 * Riusa il channel "silvio-ai" della company, lo crea se non esiste, e fa
 * round-trip via edge function `silvio-chat`. Stesso pattern di /azienda/chat
 * ma compatto e accessibile da OVUNQUE via SilvioFAB.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Send,
  Loader2,
  Brain,
  User as UserIcon,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const SILVIO_SENDER_ID = "00000000-0000-0000-0000-000000000002";

interface SilvioMessage {
  id: string;
  channel_id: string;
  sender_id: string;
  content: string;
  message_type: string;
  created_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SilvioChatSheet({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const userId = user?.id;
  const qc = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  // ── 1. Trova/crea il channel silvio-ai per questa company ──────────────
  const { data: channelId, isLoading: loadingChannel } = useQuery({
    queryKey: ["silvio-channel", companyId, userId],
    queryFn: async (): Promise<string | null> => {
      if (!companyId || !userId) return null;
      const { data: existing } = await supabase
        .from("internal_chat_channels")
        .select("id")
        .eq("company_id", companyId)
        .eq("name", "silvio-ai")
        .maybeSingle();
      if (existing?.id) {
        // Assicurati che l'utente sia member
        await supabase.from("internal_chat_members").upsert(
          { channel_id: existing.id, user_id: userId, last_read_at: new Date().toISOString() },
          { onConflict: "channel_id,user_id" }
        );
        return existing.id;
      }
      // Crea channel + membership
      const { data: created, error } = await supabase
        .from("internal_chat_channels")
        .insert({
          company_id: companyId,
          name: "silvio-ai",
          description: "Chat diretta con Silvio AI",
          type: "direct",
          created_by: userId,
        })
        .select("id")
        .single();
      if (error) {
        console.error("[SilvioChatSheet] create channel error", error);
        return null;
      }
      await supabase.from("internal_chat_members").insert([
        { channel_id: created.id, user_id: userId },
        { channel_id: created.id, user_id: SILVIO_SENDER_ID },
      ]);
      return created.id;
    },
    enabled: !!companyId && !!userId && open,
    staleTime: 60_000,
  });

  // ── 2. Carica ultimi 30 messaggi (refetch ogni 3s mentre aperto) ───────
  const { data: messages = [] } = useQuery({
    queryKey: ["silvio-messages", channelId],
    queryFn: async (): Promise<SilvioMessage[]> => {
      if (!channelId) return [];
      const { data } = await supabase
        .from("internal_chat_messages")
        .select("id, channel_id, sender_id, content, message_type, created_at")
        .eq("channel_id", channelId)
        .order("created_at", { ascending: true })
        .limit(30);
      return (data ?? []) as SilvioMessage[];
    },
    enabled: !!channelId && open,
    refetchInterval: open ? 3000 : false,
  });

  // ── 3. Scroll bottom su nuovi messaggi ─────────────────────────────────
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  // ── 4. Send message via silvio-chat edge ───────────────────────────────
  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      if (!channelId || !companyId || !userId) throw new Error("Setup non pronto");
      const trimmed = text.trim();
      if (!trimmed) return;
      // Insert user message
      const { error: insertErr } = await supabase.from("internal_chat_messages").insert({
        channel_id: channelId,
        sender_id: userId,
        company_id: companyId,
        content: trimmed,
        message_type: "text",
      });
      if (insertErr) throw new Error(`Invio: ${insertErr.message}`);
      qc.invalidateQueries({ queryKey: ["silvio-messages", channelId] });
      // Invoke Silvio
      const res = await supabase.functions.invoke("silvio-chat", {
        body: { channel_id: channelId, message: trimmed },
      });
      if (res.error) throw new Error(`Silvio: ${res.error.message}`);
      qc.invalidateQueries({ queryKey: ["silvio-messages", channelId] });
    },
    onSuccess: () => setDraft(""),
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setSending(false),
  });

  const handleSend = () => {
    if (!draft.trim() || sending) return;
    setSending(true);
    sendMutation.mutate(draft);
  };

  const renderMessage = (m: SilvioMessage) => {
    const isSilvio = m.sender_id === SILVIO_SENDER_ID;
    const isMe = m.sender_id === userId;
    return (
      <motion.div
        key={m.id}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className={`flex gap-2 ${isMe ? "justify-end" : "justify-start"}`}
      >
        {isSilvio && (
          <div className="h-7 w-7 shrink-0 rounded-full bg-gradient-to-br from-orange-500 to-amber-400 flex items-center justify-center shadow-sm">
            <Brain className="h-3.5 w-3.5 text-white" />
          </div>
        )}
        <div
          className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
            isMe
              ? "bg-orange-500 text-white rounded-br-sm"
              : "bg-slate-100 text-slate-800 rounded-bl-sm"
          }`}
        >
          {m.content}
        </div>
        {isMe && (
          <div className="h-7 w-7 shrink-0 rounded-full bg-slate-200 flex items-center justify-center">
            <UserIcon className="h-3.5 w-3.5 text-slate-600" />
          </div>
        )}
      </motion.div>
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md p-0 flex flex-col gap-0"
      >
        {/* Header */}
        <SheetHeader className="px-4 py-3 border-b bg-gradient-to-r from-orange-50 to-amber-50">
          <SheetTitle className="flex items-center gap-2 text-base">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-orange-500 to-amber-400 flex items-center justify-center">
              <Brain className="h-4 w-4 text-white" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-semibold text-slate-800">Chat con Silvio</p>
              <p className="text-[11px] text-slate-500 font-normal">Il tuo CFO/PM/Capocantiere AI</p>
            </div>
          </SheetTitle>
        </SheetHeader>

        {/* Messages area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3 bg-white">
          {loadingChannel ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              <span className="text-xs">Connetto a Silvio…</span>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4 py-8">
              <div className="h-12 w-12 rounded-full bg-gradient-to-br from-orange-500 to-amber-400 flex items-center justify-center mb-3 shadow-lg">
                <Sparkles className="h-6 w-6 text-white" fill="currentColor" />
              </div>
              <p className="text-sm font-semibold text-slate-800 mb-1">Ciao! Sono Silvio.</p>
              <p className="text-xs text-muted-foreground mb-4">
                Posso aiutarti su finanza, cantieri, vendite, personale, strategia.
                Chiedi qualsiasi cosa con i tuoi dati reali.
              </p>
              <div className="grid grid-cols-1 gap-1.5 w-full max-w-xs">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => {
                      setDraft(q);
                    }}
                    className="text-left text-xs bg-slate-50 hover:bg-orange-50 border border-slate-200 hover:border-orange-200 rounded-lg px-3 py-2 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <AnimatePresence initial={false}>{messages.map(renderMessage)}</AnimatePresence>
          )}
          {sending && (
            <div className="flex gap-2 justify-start">
              <div className="h-7 w-7 shrink-0 rounded-full bg-gradient-to-br from-orange-500 to-amber-400 flex items-center justify-center">
                <Brain className="h-3.5 w-3.5 text-white" />
              </div>
              <div className="bg-slate-100 rounded-2xl rounded-bl-sm px-3 py-2.5 flex gap-1">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-slate-400"
                    animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
                    transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Input footer */}
        <div className="border-t p-3 bg-white">
          <div className="flex gap-2 items-end">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Scrivi a Silvio…"
              rows={1}
              className="flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 max-h-32"
              disabled={sending || loadingChannel}
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!draft.trim() || sending || loadingChannel}
              className="h-10 w-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 hover:from-orange-600 hover:to-amber-500"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <div className="flex items-center justify-between mt-2 px-1">
            <p className="text-[10px] text-muted-foreground">Invio: ⏎ · Newline: ⇧⏎</p>
            <button
              type="button"
              onClick={() => {
                onOpenChange(false);
                navigate("/azienda/chat");
              }}
              className="text-[10px] text-orange-600 hover:underline flex items-center gap-0.5"
            >
              Apri chat completa <ExternalLink className="h-2.5 w-2.5" />
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

const SUGGESTED_QUESTIONS = [
  "Come sta la mia cassa nei prossimi 30 giorni?",
  "Quali commesse stanno erodendo margine?",
  "Quali clienti sono in ritardo grave?",
  "Quanti preventivi devo ancora chiudere?",
];
