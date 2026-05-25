/**
 * invokeAdminFunction — wrapper riusabile per supabase.functions.invoke
 *
 * Cosa risolve:
 *   1. Estrazione robusta dell'errore JSON dal body della Response (l'edge
 *      function può rispondere `{ error: "msg" }` con status 4xx/5xx, e il
 *      pattern `res.error.context?.json?.()` si ripete in molti posti).
 *   2. Aggiunge automaticamente l'Authorization Bearer prendendo la sessione.
 *   3. Distingue "data.error" (edge ritorna 2xx ma body con campo error) da
 *      "res.error" (edge ritorna non-2xx) — entrambi rilanciati come Error.
 *   4. Messaggi utente friendly: non più "Edge Function returned a non-2xx
 *      status code" ma il messaggio dal body o un fallback chiaro.
 *
 * Uso:
 *   const data = await invokeAdminFunction<{ users: User[] }>(
 *     "manage-platform-users",
 *     { action: "list" }
 *   );
 */
import { supabase } from "@/integrations/supabase/client";

interface InvokeOptions {
  /** Override headers (es. content-type). L'Auth header è sempre aggiunto. */
  headers?: Record<string, string>;
  /** Messaggio fallback se non riusciamo a estrarre nulla di utile. */
  fallbackErrorMessage?: string;
}

export class AdminFunctionError extends Error {
  status?: number;
  raw?: unknown;
  constructor(message: string, status?: number, raw?: unknown) {
    super(message);
    this.name = "AdminFunctionError";
    this.status = status;
    this.raw = raw;
  }
}

async function safeJsonParse(context: unknown): Promise<Record<string, unknown> | null> {
  if (!context || typeof context !== "object") return null;
  const ctx = context as { json?: () => Promise<unknown>; status?: number };
  if (typeof ctx.json !== "function") return null;
  try {
    const parsed = await ctx.json();
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    // Body non-JSON (es. HTML 500, plain text) — non vogliamo rumpere.
    return null;
  }
}

export async function invokeAdminFunction<TData = unknown>(
  functionName: string,
  body: Record<string, unknown>,
  options: InvokeOptions = {},
): Promise<TData> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  const res = await supabase.functions.invoke(functionName, {
    body,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  // Caso 1: edge function ha ritornato non-2xx → res.error popolato
  if (res.error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = (res.error as any).context;
    const parsed = await safeJsonParse(ctx);
    const message =
      (parsed?.error as string | undefined) ||
      (parsed?.message as string | undefined) ||
      res.error.message ||
      options.fallbackErrorMessage ||
      `Operazione fallita (${functionName})`;
    const status = (ctx && typeof ctx === "object" && "status" in ctx)
      ? (ctx as { status?: number }).status
      : undefined;
    throw new AdminFunctionError(message, status, res.error);
  }

  // Caso 2: edge ha ritornato 2xx ma body con { error: "..." }
  if (
    res.data &&
    typeof res.data === "object" &&
    res.data !== null &&
    "error" in (res.data as Record<string, unknown>) &&
    (res.data as Record<string, unknown>).error
  ) {
    const errorField = (res.data as Record<string, unknown>).error;
    const message = typeof errorField === "string" ? errorField : String(errorField);
    throw new AdminFunctionError(message);
  }

  return (res.data ?? null) as TData;
}
