import { supabase } from "@/integrations/supabase/client";
import type { ProxyAction } from "../types/agent.types";

interface ProxyRequest {
  action: ProxyAction;
  company_id?: string;
  agent_id?: string | null;
  payload?: Record<string, unknown>;
}

export async function callElevenLabsProxy<T = unknown>(request: ProxyRequest): Promise<T> {
  const { data, error } = await supabase.functions.invoke("elevenlabs-proxy", {
    body: request,
  });

  if (error) {
    const response = (error as { context?: Response }).context;
    if (response?.clone) {
      let message: string | undefined;
      try { message = (await response.clone().json()).error; } catch { /* Not a JSON error. */ }
      if (message) throw new Error(message);
    }
    throw new Error(error.message || "Errore nella comunicazione con il servizio AI");
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data as T;
}

/** Do not send the new mutation protocol to an older deployed backend. */
export async function requireAgentProxyV2(companyId: string): Promise<void> {
  let capabilities: { version?: number };
  try {
    capabilities = await callElevenLabsProxy<{ version?: number }>({ action: "get_capabilities", company_id: companyId });
  } catch (error) {
    if (error instanceof Error && /azione non supportata.*get_capabilities/i.test(error.message)) {
      throw new Error("Il servizio server degli agenti AI non è ancora aggiornato. Pubblica frontend e funzioni server prima di effettuare modifiche.");
    }
    throw error;
  }
  if (capabilities?.version !== 2) throw new Error("Aggiorna il servizio degli agenti AI prima di effettuare modifiche");
}
