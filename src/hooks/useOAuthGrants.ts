/**
 * Assistenti AI collegati via OAuth (registro mcp_oauth_grants).
 *
 * A differenza delle chiavi API, i collegamenti OAuth nascono quando qualcuno
 * autorizza Claude/ChatGPT dalla pagina di consenso. Qui l'azienda li vede e li
 * revoca. La sicurezza è nel database (RLS): un amministratore vede e revoca i
 * collegamenti della sua azienda; la revoca è immediata (il server MCP rifiuta i
 * grant con revoked_at valorizzato).
 *
 * La tabella non è ancora nei tipi generati: si accede con un cast controllato.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface OAuthGrant {
  id: string;
  client_id: string;
  user_id: string;
  client_name: string | null;
  livello: "consulente" | "operativo" | string;
  invii: boolean;
  last_used_at: string | null;
  created_at: string;
}

// La tabella mcp_oauth_grants non è nel Database generato: query non tipata.
type UntypedFrom = { from: (t: string) => any };

export function useOAuthGrants(companyId: string | undefined) {
  return useQuery({
    queryKey: ["oauth-grants", companyId],
    queryFn: async (): Promise<OAuthGrant[]> => {
      if (!companyId) return [];
      const { data, error } = await (supabase as unknown as UntypedFrom)
        .from("mcp_oauth_grants")
        .select("id, client_id, user_id, client_name, livello, invii, last_used_at, created_at")
        .eq("company_id", companyId)
        .is("revoked_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OAuthGrant[];
    },
    enabled: !!companyId,
    staleTime: 60 * 1000,
  });
}

export function useRevokeOAuthGrant(companyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error("Seleziona un'azienda prima di revocare il collegamento");
      const { data, error } = await (supabase as unknown as UntypedFrom)
        .from("mcp_oauth_grants")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", id).eq("company_id", companyId).is("revoked_at", null)
        .select("id, client_id, user_id").single();
      if (error) throw error;
      if (!data) throw new Error("Collegamento non trovato o revoca non autorizzata");
      // Close MCP first. Also revoke the owner's OAuth consent so Supabase
      // cannot silently skip our consent screen on the next connection.
      try {
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (!authError && auth.user?.id === data.user_id) {
          const { error: providerError } = await supabase.auth.oauth.revokeGrant({ clientId: data.client_id });
          if (!providerError) return { needsProviderRevocation: false };
        }
      } catch { /* MCP is already closed; inform the user about reauthorization. */ }
      return { needsProviderRevocation: true };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["oauth-grants", companyId] }),
  });
}
