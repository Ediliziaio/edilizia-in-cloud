import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ALL_SCOPE_IDS, type ApiKey } from "@/types/apiKeys";
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
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
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

      const trimmedName = name.trim();
      const normalizedScopes = Array.from(new Set(scopes));
      if (trimmedName.length < 3 || trimmedName.length > 80) {
        throw new Error("Il nome della chiave deve contenere tra 3 e 80 caratteri.");
      }
      if (normalizedScopes.length === 0 || normalizedScopes.some((scope) => !ALL_SCOPE_IDS.includes(scope))) {
        throw new Error("Permessi API non validi.");
      }

      const { data: duplicate, error: duplicateError } = await supabase
        .from("api_keys")
        .select("id")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .ilike("name", trimmedName)
        .limit(1)
        .maybeSingle();
      if (duplicateError) throw duplicateError;
      if (duplicate) throw new Error("Esiste già una chiave API attiva con questo nome.");

      const rawKey = generateApiKey();
      const hash = await hashApiKey(rawKey);
      const prefix = getKeyPrefix(rawKey);
      const expiresAt = computeExpiresAt(expiryOption);

      const { error } = await supabase.from("api_keys").insert({
        company_id: companyId,
        name: trimmedName,
        key_prefix: prefix,
        key_hash: hash,
        scopes: normalizedScopes,
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
      if (!companyId) throw new Error("companyId richiesto");
      const { error } = await supabase
        .from("api_keys")
        .update({ is_active: false, revoked_at: new Date().toISOString() } as any)
        .eq("id", keyId)
        .eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-keys", companyId] }),
  });
}

export function useRotateApiKey(companyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (key: ApiKey) => {
      if (!companyId) throw new Error("companyId richiesto");
      if (key.company_id !== companyId) throw new Error("Chiave API non appartenente all'azienda corrente.");
      if (!key.is_active || key.revoked_at) throw new Error("Puoi ruotare solo chiavi attive.");

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non autenticato");

      const rawKey = generateApiKey();
      const hash = await hashApiKey(rawKey);
      const prefix = getKeyPrefix(rawKey);
      const rotatedName = `${key.name} (rotata ${new Date().toLocaleDateString("it-IT")})`.slice(0, 80);

      const { error: insertError } = await supabase.from("api_keys").insert({
        company_id: companyId,
        name: rotatedName,
        key_prefix: prefix,
        key_hash: hash,
        scopes: key.scopes,
        expires_at: key.expires_at,
        rate_limit_per_minute: key.rate_limit_per_minute,
        rate_limit_per_day: key.rate_limit_per_day,
        created_by: user.id,
      } as any);
      if (insertError) throw insertError;

      const { error: revokeError } = await supabase
        .from("api_keys")
        .update({ is_active: false, revoked_at: new Date().toISOString() } as any)
        .eq("id", key.id)
        .eq("company_id", companyId);
      if (revokeError) throw revokeError;

      return { rawKey, name: rotatedName };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-keys", companyId] }),
  });
}
