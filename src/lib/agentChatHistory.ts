import { callElevenLabsProxy } from "@/modules/ai-agents/hooks/useElevenLabsProxy";
export async function agentChatHistoryRequest<T>(companyId: string, action: "chat_sessions" | "chat_messages", payload: Record<string, unknown>): Promise<T> {
  const capabilities = await callElevenLabsProxy<{ chat_history?: boolean }>({ company_id: companyId, action: "get_capabilities" });
  if (!capabilities.chat_history) throw new Error("La cronologia integrata richiede il servizio server aggiornato.");
  return callElevenLabsProxy<T>({ company_id: companyId, action, payload });
}
