/**
 * useAIChat — Hook chat universale per Silvio (canale internal_chat) e per
 * le 18 personas web (canale web_persona).
 *
 * MP-AIE-02 v2 — sostituisce le hook duplicate in SilvioChatSheet e
 * AssistenteAIPage con un'API singola.
 *
 * Differenze tra canali:
 *   - silvio:      usa edge silvio-chat + tabella internal_chat_messages
 *                  + canale auto-creato (per-user 1:1 DM con SILVIO_SENDER_ID)
 *   - web_persona: usa edge ai-orchestrator + tabelle ai_persona_sessions /
 *                  ai_persona_messages (sessioni separate per persona)
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AIChatChannel = "silvio" | "web_persona";

export interface AIToolCall {
  id?: string;
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  arguments?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result?: any;
  status?: "pending" | "success" | "error";
}

export interface AIMessage {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  toolCalls?: AIToolCall[];
  proposalIds?: string[];
  createdAt: string;
}

export interface UseAIChatOptions {
  channel: AIChatChannel;
  /** "silvio" o una delle 17 personas (cfo, pm_cantiere, ...) */
  personaKey: string;
  /**
   * - silvio: ID del canale internal_chat per l'utente (auto-creato server-side)
   * - web_persona: ID di ai_persona_sessions
   * Se omesso, una nuova sessione viene creata al primo sendMessage.
   */
  sessionId?: string;
  /** Limit history caricata. Default 30. */
  historyLimit?: number;
}

export interface UseAIChatResult {
  sessionId: string | null;
  messages: AIMessage[];
  isLoading: boolean;
  error: string | null;
  sendMessage: (content: string) => Promise<void>;
  startNewSession: () => Promise<string | null>;
  loadSession: (id: string) => Promise<void>;
  resetError: () => void;
}

interface PersonaMessageRow {
  id: string;
  role: string;
  content: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tool_calls: any | null;
  created_at: string;
}

interface InternalChatMessageRow {
  id: string;
  sender_id: string | null;
  content: string | null;
  message_type: string | null;
  created_at: string;
}

const SILVIO_SENDER_ID = "00000000-0000-0000-0000-000000000002";

export function useAIChat(opts: UseAIChatOptions): UseAIChatResult {
  const { channel, personaKey, historyLimit = 30 } = opts;
  const [sessionId, setSessionId] = useState<string | null>(opts.sessionId ?? null);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync sessionId iniziale + carica history
  useEffect(() => {
    if (opts.sessionId && opts.sessionId !== sessionId) {
      setSessionId(opts.sessionId);
      void loadSessionInternal(opts.sessionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.sessionId]);

  const loadSessionInternal = useCallback(async (id: string) => {
    setError(null);
    try {
      if (channel === "silvio") {
        const { data, error: dbErr } = await supabase
          .from("internal_chat_messages")
          .select("id, sender_id, content, message_type, created_at")
          .eq("channel_id", id)
          .order("created_at", { ascending: true })
          .limit(historyLimit);
        if (dbErr) throw new Error(dbErr.message);
        const rows = (data ?? []) as InternalChatMessageRow[];
        setMessages(
          rows.map((m): AIMessage => ({
            id: m.id,
            role: m.sender_id === SILVIO_SENDER_ID ? "assistant" : "user",
            content: m.content ?? "",
            createdAt: m.created_at,
          })),
        );
      } else {
        const { data, error: dbErr } = await supabase
          .from("ai_persona_messages" as never)
          .select("id, role, content, tool_calls, created_at")
          .eq("session_id", id)
          .order("created_at", { ascending: true })
          .limit(historyLimit);
        if (dbErr) throw new Error(dbErr.message);
        const rows = (data ?? []) as unknown as PersonaMessageRow[];
        setMessages(
          rows.map((m): AIMessage => ({
            id: m.id,
            role: (m.role as AIMessage["role"]) ?? "user",
            content: m.content ?? "",
            toolCalls: Array.isArray(m.tool_calls)
              ? (m.tool_calls as AIToolCall[])
              : undefined,
            createdAt: m.created_at,
          })),
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    }
  }, [channel, historyLimit]);

  const startNewSession = useCallback(async (): Promise<string | null> => {
    setError(null);
    try {
      if (channel === "silvio") {
        // Silvio: il canale è auto-creato server-side (trigger su profiles).
        // Recupera l'ID del canale per l'utente corrente.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error: rpcErr } = await (supabase as any).rpc("ensure_user_silvio_channel");
        if (rpcErr) throw new Error(rpcErr.message);
        const id = String(data);
        setSessionId(id);
        setMessages([]);
        return id;
      }
      // 18 personas: crea sessione tipica
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: rpcErr } = await (supabase as any).rpc("create_persona_session", {
        p_persona_key: personaKey,
        p_title: "Nuova conversazione",
      });
      if (rpcErr) throw new Error(rpcErr.message);
      const id = String(data);
      setSessionId(id);
      setMessages([]);
      return id;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      return null;
    }
  }, [channel, personaKey]);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim()) return;
    let sid = sessionId;
    if (!sid) {
      sid = await startNewSession();
      if (!sid) return;
    }

    setIsLoading(true);
    setError(null);

    const userMsg: AIMessage = {
      id: `temp-user-${Date.now()}`,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const fnName = channel === "silvio" ? "silvio-chat" : "ai-orchestrator";
      const body = channel === "silvio"
        ? { channel_id: sid, message: content }
        : { sessionId: sid, personaKey, message: content };

      const { data, error: invokeErr } = await supabase.functions.invoke(fnName, { body });
      if (invokeErr) throw new Error(invokeErr.message);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = data as any;
      const assistantContent = (r?.response ?? r?.reply ?? "").toString();
      const toolCallsRaw = r?.toolCalls ?? r?.tool_calls ?? [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tcMapped: AIToolCall[] = Array.isArray(toolCallsRaw)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? toolCallsRaw.map((tc: any) => ({
          id: tc.id,
          name: tc.name ?? tc?.function?.name ?? "tool",
          arguments: tc.args ?? tc.arguments,
          status: "success",
        }))
        : [];

      const assistantMsg: AIMessage = {
        id: r?.messageId ? String(r.messageId) : `asst-${Date.now()}`,
        role: "assistant",
        content: assistantContent,
        toolCalls: tcMapped.length > 0 ? tcMapped : undefined,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      // Rimuovi user msg ottimistico (l'utente può riprovare)
      setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, channel, personaKey, startNewSession]);

  return {
    sessionId,
    messages,
    isLoading,
    error,
    sendMessage,
    startNewSession,
    loadSession: loadSessionInternal,
    resetError: () => setError(null),
  };
}
