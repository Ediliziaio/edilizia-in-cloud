import { supabase } from "@/integrations/supabase/client";

/** Server-side credentials only. Browser sends the user session, never FISH_API_KEY. */
export async function callFishAgent<T = Record<string, unknown>>(companyId: string, agentId: string, action: string, input: Record<string, unknown> = {}): Promise<T> {
  const invoke=()=>supabase.functions.invoke("fish-agent-proxy", { body: { ...input, company_id: companyId, agent_id: agentId, action } });
  let { data, error } = await invoke();
  // A 401 happens before management authorization and provider side effects.
  // Refresh the existing user session once; never retry ambiguous network failures.
  if(error?.context instanceof Response && error.context.status===401) {
    const refreshed=await supabase.auth.refreshSession();
    if(refreshed.error)throw new Error("La sessione è scaduta. Accedi di nuovo a Edilizia in Cloud per continuare.");
    ({data,error}=await invoke());
    if(error?.context instanceof Response && error.context.status===401)throw new Error("La sessione è scaduta. Accedi di nuovo a Edilizia in Cloud per continuare.");
  }
  if (error) {
    let message = "Backend Fish non disponibile. Verifica funzioni locali, migrazione e configurazione del server.";
    if (error.context instanceof Response) {
      const body = await error.context.clone().json().catch(() => null);
      if (typeof body?.error === "string") message = body.error;
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(String(data.error));
  return data as T;
}
