/**
 * PublicChatWidget — chatbot pubblico embeddable per lead capture sito web
 *
 * Usa l'edge function `public-chat-widget` (no auth, CORS aperto).
 * Sessione anonima tracciata via visitor_token in localStorage.
 *
 * Usage:
 *   <PublicChatWidget widgetToken="UUID_DEL_WIDGET" />
 *
 * Per embed esterno (su sito non-React) → usare il loader script
 * `public-chat-loader.ts` che monta dinamicamente questo component.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { MessageCircle, X, Send, Loader2, Minimize2 } from "lucide-react";

interface Props {
  /** UUID del widget configurato in public_chatbot_settings */
  widgetToken: string;
  /** URL base Supabase functions (default: prod) */
  apiBase?: string;
  /** Posizione del FAB chiuso (default: bottom-right) */
  position?: "bottom-right" | "bottom-left";
  /** Apre il widget all'avvio invece di mostrare solo il FAB */
  defaultOpen?: boolean;
  /** Callback quando l'utente viene qualificato (lead capture riuscito) */
  onQualified?: (data: { sessionId: string }) => void;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  ts: number;
}

interface InitResponse {
  ok: boolean;
  session_id?: string;
  welcome?: string;
  bot_name?: string;
  primary_color?: string;
  error?: string;
}

interface MessageResponse {
  ok: boolean;
  response?: string;
  qualified?: boolean;
  error?: string;
}

const STORAGE_KEY_PREFIX = "eic_chat_v1_";

function getOrCreateVisitorToken(widgetToken: string): string {
  const key = `${STORAGE_KEY_PREFIX}vt_${widgetToken}`;
  try {
    let token = localStorage.getItem(key);
    if (!token) {
      token = crypto.randomUUID();
      localStorage.setItem(key, token);
    }
    return token;
  } catch {
    // Fallback se localStorage non disponibile
    return crypto.randomUUID();
  }
}

function getUtmParams(): Record<string, string | undefined> {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  return {
    utm_source: params.get("utm_source") ?? undefined,
    utm_medium: params.get("utm_medium") ?? undefined,
    utm_campaign: params.get("utm_campaign") ?? undefined,
  };
}

export function PublicChatWidget({
  widgetToken,
  apiBase = "https://rsbrguhkodgnqfomrevo.supabase.co",
  position = "bottom-right",
  defaultOpen = false,
  onQualified,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [sending, setSending] = useState(false);
  const [initLoading, setInitLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [botName, setBotName] = useState("Assistente");
  const [primaryColor, setPrimaryColor] = useState("#2563EB");
  const [qualified, setQualified] = useState(false);

  const visitorTokenRef = useRef<string>(getOrCreateVisitorToken(widgetToken));
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const apiUrl = `${apiBase}/functions/v1/public-chat-widget`;

  // Notifica parent (embed iframe) eventi open/close per ridimensionare
  useEffect(() => {
    try {
      window.parent.postMessage(
        { source: "eic-public-chat", event: open ? "open" : "close" },
        "*",
      );
    } catch {
      /* not in iframe or cross-origin block */
    }
  }, [open]);

  const initSession = useCallback(async () => {
    if (sessionId) return;
    setInitLoading(true);
    setError(null);
    try {
      const utm = getUtmParams();
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "init",
          widget_token: widgetToken,
          visitor_token: visitorTokenRef.current,
          source_page: typeof window !== "undefined" ? window.location.href : undefined,
          source_referrer: typeof document !== "undefined" ? document.referrer : undefined,
          ...utm,
        }),
      });
      const data = (await res.json()) as InitResponse;
      if (!data.ok || !data.session_id) {
        setError(data.error ?? "Impossibile avviare la chat");
        return;
      }
      setSessionId(data.session_id);
      if (data.bot_name) setBotName(data.bot_name);
      if (data.primary_color) setPrimaryColor(data.primary_color);
      if (data.welcome) {
        setMessages([{ role: "assistant", content: data.welcome, ts: Date.now() }]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore connessione");
    } finally {
      setInitLoading(false);
    }
  }, [widgetToken, apiUrl, sessionId]);

  // Auto-init alla prima apertura
  useEffect(() => {
    if (open && !sessionId && !initLoading) {
      void initSession();
    }
  }, [open, sessionId, initLoading, initSession]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (open && messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [open, messages.length]);

  // Auto-focus input quando apre
  useEffect(() => {
    if (open && sessionId) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, sessionId]);

  const sendMessage = async () => {
    const content = inputValue.trim();
    if (!content || !sessionId || sending) return;

    setMessages((prev) => [...prev, { role: "user", content, ts: Date.now() }]);
    setInputValue("");
    setSending(true);
    setError(null);

    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "message",
          session_id: sessionId,
          visitor_token: visitorTokenRef.current,
          content,
        }),
      });
      const data = (await res.json()) as MessageResponse;
      if (!data.ok) {
        setError(data.error ?? "Errore risposta");
        return;
      }
      if (data.response) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.response!, ts: Date.now() },
        ]);
      }
      if (data.qualified && !qualified) {
        setQualified(true);
        onQualified?.({ sessionId });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore invio");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  const positionClasses = position === "bottom-right"
    ? "right-4 bottom-4 sm:right-6 sm:bottom-6"
    : "left-4 bottom-4 sm:left-6 sm:bottom-6";

  // ─── FAB Closed ────────────────────────────────────────────────────────
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Apri chat"
        className={`fixed ${positionClasses} z-50 h-14 w-14 rounded-full shadow-lg hover:scale-110 transition-all flex items-center justify-center text-white`}
        style={{ backgroundColor: primaryColor }}
      >
        <MessageCircle className="h-6 w-6" />
      </button>
    );
  }

  // ─── Open Chat Panel ───────────────────────────────────────────────────
  return (
    <div
      className={`fixed ${positionClasses} z-50 w-[calc(100vw-2rem)] sm:w-96 max-w-md h-[600px] max-h-[calc(100vh-2rem)] bg-background rounded-xl shadow-2xl border flex flex-col overflow-hidden`}
      role="dialog"
      aria-label="Chat con assistente"
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 text-white"
        style={{ backgroundColor: primaryColor }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
            <MessageCircle className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-sm truncate">{botName}</div>
            <div className="text-xs opacity-90">Online · risposta entro 1min</div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setOpen(false)}
            aria-label="Minimizza"
            className="p-1.5 hover:bg-white/20 rounded-md transition-colors"
          >
            <Minimize2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => setOpen(false)}
            aria-label="Chiudi"
            className="p-1.5 hover:bg-white/20 rounded-md transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/20">
        {initLoading && messages.length === 0 ? (
          <div className="flex justify-center pt-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : null}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                msg.role === "user"
                  ? "rounded-br-sm text-white"
                  : "bg-background border rounded-bl-sm"
              }`}
              style={msg.role === "user" ? { backgroundColor: primaryColor } : undefined}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {sending ? (
          <div className="flex justify-start">
            <div className="bg-background border rounded-2xl rounded-bl-sm px-3 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        ) : null}

        {qualified ? (
          <div className="flex justify-center">
            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-md px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
              ✓ Grazie! Ti contatteremo entro 24h.
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="flex justify-center">
            <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-md px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
              {error}
            </div>
          </div>
        ) : null}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t p-3 bg-background">
        <div className="flex items-end gap-2">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!sessionId || sending}
            placeholder={sessionId ? "Scrivi un messaggio..." : "Connessione..."}
            className="flex-1 rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-offset-1"
            style={{ outlineColor: primaryColor }}
          />
          <button
            type="button"
            onClick={() => void sendMessage()}
            disabled={!inputValue.trim() || sending || !sessionId}
            aria-label="Invia"
            className="h-10 w-10 rounded-md text-white flex items-center justify-center disabled:opacity-50 transition-opacity"
            style={{ backgroundColor: primaryColor }}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-2 text-center">
          Powered by Edilizia in Cloud · I tuoi dati sono trattati secondo la nostra Privacy Policy
        </p>
      </div>
    </div>
  );
}
