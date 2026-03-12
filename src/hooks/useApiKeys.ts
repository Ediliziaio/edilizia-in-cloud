import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ApiKey } from "@/types/apiKeys";
import { generateApiKey, hashApiKey, getKeyPrefix, computeExpiresAt } from "@/lib/apiKeyUtils";
import type { ExpiryOption } from "@/lib/apiKeyUtils";

export function useApiKeys(companyId: string | undefined) {
  return useQuery({
    queryKey: ["api-keys", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("api_keys")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as ApiKey[];
    },
    enabled: !!companyId,
  });
}

export function useCreateApiKey(companyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      name,
      scopes,
      expiryOption,
    }: {
      name: string;
      scopes: string[];
      expiryOption: ExpiryOption;
    }) => {
      if (!companyId) throw new Error("companyId richiesto");

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non autenticato");

      const rawKey = generateApiKey();
      const hash = await hashApiKey(rawKey);
      const prefix = getKeyPrefix(rawKey);
      const expiresAt = computeExpiresAt(expiryOption);

      const { error } = await supabase.from("api_keys").insert({
        company_id: companyId,
        name,
        key_prefix: prefix,
        key_hash: hash,
        scopes,
        expires_at: expiresAt?.toISOString() || null,
        created_by: user.id,
      } as any);
      if (error) throw error;

      return rawKey;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-keys", companyId] }),
  });
}

export function useRevokeApiKey(companyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (keyId: string) => {
      const { error } = await supabase
        .from("api_keys")
        .update({ is_active: false, revoked_at: new Date().toISOString() } as any)
        .eq("id", keyId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-keys", companyId] }),
  });
}
