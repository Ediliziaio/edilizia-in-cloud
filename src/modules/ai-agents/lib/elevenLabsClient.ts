import { supabase } from "@/integrations/supabase/client";
import type { ProxyAction } from "../types/agent.types";

interface ProxyRequest {
  action: ProxyAction;
  agent_id?: string;
  payload?: Record<string, unknown>;
}

async function invokeProxy<T = unknown>(request: ProxyRequest): Promise<T> {
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

export const elevenLabsClient = {
  createAgent: (payload: Record<string, unknown>) =>
    invokeProxy<{ agent_id: string; elevenlabs_agent_id: string }>({
      action: "create_agent",
      payload,
    }),

  updateAgent: (agentId: string, payload: Record<string, unknown>) =>
    invokeProxy({ action: "update_agent", agent_id: agentId, payload }),

  deleteAgent: (agentId: string) =>
    invokeProxy({ action: "delete_agent", agent_id: agentId }),

  getVoices: () =>
    invokeProxy<{ voices: Array<{ voice_id: string; name: string; category: string; labels: Record<string, string>; preview_url: string | null }> }>({
      action: "get_voices",
    }),

  getModels: () =>
    invokeProxy<Array<{ model_id: string; name: string; description: string }>>({
      action: "get_models",
    }),

  testConnection: () =>
    invokeProxy<{ voices: unknown[] }>({ action: "get_voices" }),
};
