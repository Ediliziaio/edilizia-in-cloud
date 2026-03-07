import { supabase } from "@/integrations/supabase/client";
import type { ProxyAction } from "../types/agent.types";

interface ProxyRequest {
  action: ProxyAction;
  agent_id?: string;
  payload?: Record<string, unknown>;
}

export async function callElevenLabsProxy<T = unknown>(request: ProxyRequest): Promise<T> {
  const { data, error } = await supabase.functions.invoke("elevenlabs-proxy", {
    body: request,
  });

  if (error) {
    throw new Error(error.message || "Errore nella comunicazione con il servizio AI");
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data as T;
}
