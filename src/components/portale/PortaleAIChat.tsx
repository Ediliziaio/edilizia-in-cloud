/**
 * PortaleAIChat — GAP 6 (AI per committente cliente finale)
 *
 * Widget chat dedicato al committente edile (cliente finale) loggato nel
 * /portale/:token. Risponde a domande su:
 *   - Stato cantieri
 *   - Fatture (scadenze, importi, voci)
 *   - Appuntamenti
 *
 * Differenze vs widget chat operator-side:
 *   - Tono cliente-friendly (no gergo tecnico edile interno)
 *   - Mai dati sensibili azienda (margine, listino fornitori, costi reali)
 *   - History in-memory (no persistence — privacy-by-default)
 *   - Suggerimenti follow-up cliccabili in fondo a ogni risposta
 *
 * Backend: edge function `cliente-ai-assistente` (auth via portale token).
 */
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bot, Loader2, MessageCircle, Sparkles, X, Send } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  suggestions?: string[];
  timestamp: number;
}

interface AIResponse {
  reply?: string;
  suggestions?: string[];
  model_used?: string;
  cost_usd?: number;
  error?: string;
}

interface Props {
  token: string;
  customerName?: string | null;
}

const DEFAULT_SUGGESTIONS = [
  "A che punto è il mio cantiere?",
  "Quando arriva il prossimo SAL?",
  "Quando viene il tecnico?",
];

export function PortaleAIChat({ token, customerName }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll auto bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

  const handleSend = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    const userMsg: ChatMessage = { role: "user", content: trimmed, timestamp: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setDraft("");
    setSending(true);

    try {
      const { data, error } = await supabase.functions.invoke<AIResponse>(
        "cliente-ai-assistente",
        {
          body: {
            token,
            message: trimmed,
            history: messages.slice(-6).map((m) => ({ role: m.role, content: m.content })),
          },
        },
      );
      if (error) throw new Error(error.message);
      const reply = data?.reply ?? "Mi dispiace, non sono riuscito a processare la richiesta. Riprova tra poco.";
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: reply,
        suggestions: data?.suggestions ?? [],
        timestamp: Date.now(),
      }]);
    } catch (e) {
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: `Mi dispiace, in questo momento non riesco a rispondere. ${e instanceof Error ? e.message : ""}`,
        timestamp: Date.now(),
      }]);
    } finally {
      setSending(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-6 right-6 z-40",
          "h-14 w-14 rounded-full shadow-xl flex items-center justify-center",
          "bg-gradient-to-br from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700",
          "text-white transition-transform hover:scale-105",
        )}
        aria-label="Apri assistente AI"
        title="Assistente AI — chiedi qualunque cosa"
      >
        <Bot className="h-6 w-6" />
        <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-white" />
      </button>
    );
  }

  return (
    <Card className="fixed bottom-6 right-6 z-40 w-[calc(100vw-2rem)] sm:w-[420px] h-[600px] max-h-[calc(100vh-3rem)] shadow-2xl flex flex-col border-violet-200">
      <CardHeader className="bg-gradient-to-r from-violet-500 to-indigo-600 text-white p-3 rounded-t-lg shrink-0">
        <CardTitle className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <Bot className="h-4 w-4" />
            Assistente AI
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="hover:bg-white/20 p-1 rounded transition-colors"
            aria-label="Chiudi"
          >
            <X className="h-4 w-4" />
          </button>
        </CardTitle>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden flex flex-col p-0 min-h-0">
        {/* Empty state */}
        {messages.length === 0 && (
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            <div className="text-center py-6">
              <Sparkles className="h-8 w-8 mx-auto text-violet-500" />
              <p className="text-sm font-medium mt-2">
                Ciao{customerName ? ` ${customerName}` : ""}! Come posso aiutarti?
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Posso rispondere su cantieri, fatture, appuntamenti.
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                Esempi
              </p>
              {DEFAULT_SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSend(s)}
                  className="w-full text-left p-2 rounded-lg border bg-muted/20 hover:bg-muted/40 text-xs transition-colors"
                >
                  <MessageCircle className="h-3 w-3 inline mr-1.5 text-violet-500" />
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Conversation */}
        {messages.length > 0 && (
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={cn("flex flex-col gap-1", m.role === "user" ? "items-end" : "items-start")}>
                <div className={cn(
                  "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                  m.role === "user"
                    ? "bg-violet-600 text-white"
                    : "bg-muted",
                )}>
                  {m.content}
                </div>
                {m.role === "assistant" && (m.suggestions ?? []).length > 0 && (
                  <div className="mt-1 space-y-1 max-w-[85%]">
                    {m.suggestions!.map((s, si) => (
                      <button
                        key={si}
                        type="button"
                        onClick={() => handleSend(s)}
                        disabled={sending}
                        className="block w-full text-left text-[11px] px-2 py-1 rounded border hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-colors disabled:opacity-50"
                      >
                        → {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {sending && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Sto pensando…
              </div>
            )}
          </div>
        )}

        {/* Input */}
        <div className="border-t p-2.5 flex items-center gap-2 shrink-0">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend(draft);
              }
            }}
            placeholder="Scrivi una domanda..."
            disabled={sending}
            className="text-sm"
          />
          <Button
            size="icon"
            onClick={() => handleSend(draft)}
            disabled={sending || draft.trim().length < 2}
            className="bg-violet-600 hover:bg-violet-700 shrink-0"
            aria-label="Invia"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default PortaleAIChat;
