/**
 * AdsBotChatPanel — pannello chat AdsBot flottante per il modulo Pubblicità.
 *
 * Patterns:
 *   • Pulsante FAB in basso a destra (collassato per default)
 *   • Espande in card 380x560px con chat history scrollable + textarea
 *   • Quick suggestions cliccabili
 *   • Action buttons (apri wizard / apri settings)
 *   • Context-aware: riceve campaign_id + wizard_step da AdsManagerBeta
 */
import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bot,
  Send,
  Sparkles,
  Trash2,
  X,
  Loader2,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAdsBot, type AdsBotContext } from "@/hooks/useAdsBot";

interface Props {
  companyId: string | undefined;
  context?: AdsBotContext;
}

export function AdsBotChatPanel({ companyId, context }: Props) {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { messages, isLoading, sendMessage, clear } = useAdsBot(companyId);

  // Autoscroll a fondo conversazione
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  // Focus textarea quando si apre
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    void sendMessage(input, context);
    setInput("");
  };

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleAction = (action: { type: string; url?: string }) => {
    if (action.url) {
      if (action.url.startsWith("http")) {
        window.open(action.url, "_blank", "noopener");
      } else {
        navigate(action.url);
      }
      return;
    }
    if (action.type === "open_wizard") {
      navigate("/azienda/marketing/pubblicita?mode=create");
      setIsOpen(false);
    } else if (action.type === "open_settings") {
      navigate("/azienda/marketing/pubblicita?tab=impostazioni");
      setIsOpen(false);
    }
  };

  if (!companyId) return null;

  // Unread indicator: se ci sono nuovi messaggi assistant dopo l'ultima apertura
  const lastMsg = messages[messages.length - 1];
  const hasNew = lastMsg?.role === "assistant" && lastMsg.id !== "welcome";

  return (
    <>
      {/* FAB — impilato SOPRA la bolla di Silvio (che vive a bottom-5 right-5):
          prima erano nello stesso punto e Silvio copriva AdsBot. Più piccolo
          per non affollare l'angolo. */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="Apri AdsBot"
          title="AdsBot — consulente campagne"
          // Telefono: niente seconda bolla sopra l'elenco, l'assistente è Silvio nella barra in basso.
          className="fixed bottom-24 right-6 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-lg transition-transform hover:scale-105 active:scale-95 max-sm:hidden"
        >
          <Bot className="h-6 w-6" />
          {hasNew && (
            <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-300 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-400" />
            </span>
          )}
        </button>
      )}

      {/* PANEL */}
      {isOpen && (
        <Card className="fixed bottom-5 right-5 z-40 flex h-[560px] w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden border-orange-200 shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b bg-gradient-to-r from-orange-500 to-orange-600 px-3 py-2.5 text-white">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20">
                <Bot className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold leading-tight">AdsBot</p>
                <p className="text-[10px] leading-tight opacity-80">
                  Consulente Meta · Google Ads
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                aria-label="Pulisci conversazione"
                className="h-7 w-7 text-white hover:bg-white/20"
                onClick={() => {
                  if (confirm("Vuoi davvero cancellare tutta la conversazione?")) clear();
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Chiudi AdsBot"
                className="h-7 w-7 text-white hover:bg-white/20"
                onClick={() => setIsOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto bg-slate-50/40 p-3"
          >
            {messages.length === 0 ? (
              <div className="flex h-full items-center justify-center text-center">
                <div>
                  <MessageSquare className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                  <p className="text-sm text-slate-500">Chiedi qualsiasi cosa su Meta/Google Ads</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((m) => (
                  <MessageBubble
                    key={m.id}
                    message={m}
                    onSuggestionClick={(s) => {
                      setInput(s);
                      textareaRef.current?.focus();
                    }}
                    onActionClick={handleAction}
                  />
                ))}
                {isLoading && (
                  <div className="flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-xs text-slate-500 shadow-sm">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    AdsBot sta pensando...
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t bg-white p-2">
            <div className="flex items-end gap-2">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Chiedi consigli, spiegazioni, errori..."
                rows={1}
                disabled={isLoading}
                className="min-h-[40px] resize-none border-slate-200 text-sm"
              />
              <Button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                size="icon"
                aria-label="Invia"
                className="shrink-0 bg-orange-500 hover:bg-orange-600"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Premi Enter per inviare · Shift+Enter per andare a capo
            </p>
          </div>
        </Card>
      )}
    </>
  );
}

function MessageBubble({
  message,
  onSuggestionClick,
  onActionClick,
}: {
  message: ReturnType<typeof useAdsBot>["messages"][number];
  onSuggestionClick: (text: string) => void;
  onActionClick: (action: { type: string; url?: string }) => void;
}) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] space-y-2",
          isUser ? "items-end" : "items-start",
        )}
      >
        <div
          className={cn(
            "rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm",
            isUser
              ? "rounded-tr-sm bg-orange-500 text-white"
              : "rounded-tl-sm border bg-white text-slate-900",
          )}
        >
          {!isUser && (
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase text-orange-600">
              <Sparkles className="h-3 w-3" />
              AdsBot
            </div>
          )}
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>

        {/* Suggested follow-ups */}
        {!isUser && message.suggestions && message.suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {message.suggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onSuggestionClick(s)}
                className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[11px] text-orange-700 hover:bg-orange-100"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Action buttons */}
        {!isUser && message.actions && message.actions.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {message.actions.map((a, i) => (
              <Button
                key={i}
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => onActionClick(a)}
              >
                {a.label}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function AdsBotInlineBadge() {
  return (
    <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700">
      <Bot className="mr-1 h-3 w-3" />
      AdsBot disponibile
    </Badge>
  );
}
