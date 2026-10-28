import { supabase } from "@/integrations/supabase/client";
import { edgeErrorMessage } from "@/lib/edgeFunctionError";

export async function invokeSaltEdge(companyId: string | null | undefined, body: Record<string, unknown>) {
  if (!companyId) throw new Error("Seleziona un'azienda per gestire i conti bancari.");
  const { data, error } = await supabase.functions.invoke("bank-saltedge", { body: { ...body, company_id: companyId } });
  if (error) {
    const fallback = "Collegamento Salt Edge non disponibile. Verifica la configurazione della beta o riprova tra poco.";
    const message = await edgeErrorMessage(error, fallback);
    throw new Error(/Failed to (send|fetch)|non-2xx|NetworkError|Load failed/i.test(message) ? fallback : message);
  }
  if (data?.error && body.action !== "status") throw new Error(data.error);
  return data;
}

export function validSaltWidgetUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try { const u = new URL(value); return u.origin === "https://www.saltedge.com" && !u.username && !u.password; } catch { return false; }
}

export const BANKING_QUERY_KEYS = ["bank-connections", "bank-accounts", "bank-transactions", "treasury", "cashflow"];
