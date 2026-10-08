import { supabase } from "@/integrations/supabase/client";

export interface DeliveredSilvioMessage {
  id: string;
  channel_id: string;
  sender_id: string;
  reply_to_id: string | null;
  content: string;
  created_at: string;
  message_type: string;
  streaming?: boolean | null;
  last_model_id?: string | null;
}

type InvokeResult = { data: Record<string, unknown> | null; error: Error | null };

/** One invocation only. Read-only reconciliation survives an HTTP timeout or a
 * missed Realtime event. Never infer delivery from another question's reply. */
export function invokeSilvioWithRecovery(options: {
  functionName: string;
  body: Record<string, unknown> & { channel_id: string };
  requestMessageId?: string;
  ignoreMessageIds?: string[];
  senderId: string;
  signal?: AbortSignal;
  onMessage: (message: DeliveredSilvioMessage) => void;
  onRecovering?: () => void;
}): Promise<InvokeResult> {
  const { body, requestMessageId, signal, onMessage } = options;
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastMessage = "";
    const deadline = setTimeout(() => finish(undefined, new Error(
      "Non riesco a confermare la risposta. La domanda è salvata: controlla la conversazione prima di reinviarla.",
    )), 240_000);
    const finish = (result?: InvokeResult, error?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearTimeout(deadline);
      signal?.removeEventListener("abort", abort);
      // Stops the transport/read, not the server-side generation.
      controller.abort();
      if (error) reject(error);
      else resolve(result!);
    };
    const abort = () => finish(undefined, new DOMException("Attesa interrotta", "AbortError"));
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener("abort", abort, { once: true });

    const acceptMessage = (value: unknown): DeliveredSilvioMessage | null => {
      if (!value || typeof value !== "object" || !requestMessageId) return null;
      const message = value as DeliveredSilvioMessage;
      if (typeof message.id !== "string" || !message.id || typeof message.content !== "string" ||
          options.ignoreMessageIds?.includes(message.id) || message.channel_id !== body.channel_id ||
          message.sender_id !== options.senderId || message.reply_to_id !== requestMessageId) return null;
      const signature = JSON.stringify(message);
      if (signature !== lastMessage) { lastMessage = signature; onMessage(message); }
      return message;
    };
    const isComplete = (message: DeliveredSilvioMessage | null) =>
      !!message && message.streaming !== true && !!message.content.trim();

    const poll = async () => {
      if (done || !requestMessageId) return;
      try {
        const { data, error } = await supabase.from("internal_chat_messages")
          .select("*")
          .eq("channel_id", body.channel_id)
          .eq("sender_id", options.senderId)
          .eq("reply_to_id", requestMessageId)
          .order("created_at", { ascending: false }).limit(1)
          .abortSignal(controller.signal).maybeSingle();
        if (done) return;
        const message = !error ? acceptMessage(data) : null;
        if (message) {
          if (isComplete(message)) {
            finish({ data: { ok: true, reply: message.content, message_id: message.id,
              model_used: message.last_model_id, recovered: true }, error: null });
            return;
          }
        }
      } catch {
        // A read failure must not retry the paid invocation or hide a real
        // application error. Retry only this bounded read while awaiting it.
      }
      if (!done) timer = setTimeout(() => void poll(), 2_000);
    };
    if (requestMessageId) timer = setTimeout(() => void poll(), 2_000);

    void (async () => {
      try {
        const result = await supabase.functions.invoke(options.functionName, {
          body: { ...body, ...(requestMessageId ? { request_message_id: requestMessageId } : {}) },
          signal: controller.signal,
        });
        if (done) return;
        const error = result.error;
        const context = (error as { context?: unknown } | null)?.context;
        const status = context instanceof Response ? context.status : undefined;
        // Explicit auth/validation/rate-limit failures are not transport loss.
        if ((status !== undefined && status < 500) || !requestMessageId || (!error && result.data?.ok === false)) {
          finish(result as InvokeResult);
        } else {
          const delivered = !error ? acceptMessage(result.data?.message) : null;
          if (isComplete(delivered)) { finish(result as InvokeResult); return; }
          // HTTP 200 is not delivery: keep reconciling empty acknowledgements,
          // partial streams and replies that belong to another request.
          options.onRecovering?.();
        }
      } catch (error) {
        if (done) return;
        if (!requestMessageId) finish(undefined, error instanceof Error ? error : new Error(String(error)));
        else options.onRecovering?.();
      }
    })();
  });
}
