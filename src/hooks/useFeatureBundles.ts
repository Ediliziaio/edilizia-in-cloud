// v8.6.55 — CRUD bundle di feature riutilizzabili lato super_admin.
//
// Vedi migration 20270519100000_feature_bundles.sql per lo schema.
// Bundle = set di feature_keys applicabili in batch a una company via
// upsert su company_feature_overrides.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface FeatureBundle {
  id: string;
  name: string;
  description: string | null;
  feature_keys: string[];
  price_monthly: number | null;
  price_yearly: number | null;
  category: string | null;
  icon: string | null;
  position: number;
  is_active: boolean;
  is_template: boolean;
  company_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface FeatureBundleInput {
  name: string;
  description?: string | null;
  feature_keys: string[];
  price_monthly?: number | null;
  price_yearly?: number | null;
  category?: string | null;
  icon?: string | null;
  position?: number;
  is_template?: boolean;
  company_id?: string | null;
}

const BUNDLES_KEY = ["feature-bundles"] as const;

export function useFeatureBundles(options?: { onlyTemplates?: boolean }) {
  return useQuery({
    queryKey: [...BUNDLES_KEY, options?.onlyTemplates ?? false],
    queryFn: async (): Promise<FeatureBundle[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from("feature_bundles")
        .select("*")
        .eq("is_active", true)
        .order("position", { ascending: true })
        .order("name", { ascending: true });
      if (options?.onlyTemplates) q = q.eq("is_template", true);
      const { data, error } = await q;
      if (error) {
        // Resiliente pre-migration: tabella non esiste → []
        if (/feature_bundles.*does not exist/i.test(error.message ?? "")) return [];
        throw error;
      }
      return (data ?? []) as FeatureBundle[];
    },
    retry: false,
  });
}

export function useCreateFeatureBundle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: FeatureBundleInput) => {
      const name = input.name.trim();
      if (!name) throw new Error("Nome obbligatorio");
      if (!Array.isArray(input.feature_keys) || input.feature_keys.length === 0) {
        throw new Error("Seleziona almeno una feature");
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("feature_bundles")
        .insert({
          name,
          description: input.description ?? null,
          feature_keys: input.feature_keys,
          price_monthly: input.price_monthly ?? null,
          price_yearly: input.price_yearly ?? null,
          category: input.category ?? null,
          icon: input.icon ?? null,
          position: input.position ?? 99,
          is_template: input.is_template ?? true,
          company_id: input.company_id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: () => {
      toast.success("Bundle creato");
      qc.invalidateQueries({ queryKey: BUNDLES_KEY });
    },
    onError: (err) =>
      toast.error("Errore creazione bundle", {
        description: err instanceof Error ? err.message : "Errore sconosciuto",
      }),
  });
}

export function useUpdateFeatureBundle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & Partial<FeatureBundleInput>) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("feature_bundles")
        .update(patch)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Bundle aggiornato");
      qc.invalidateQueries({ queryKey: BUNDLES_KEY });
    },
    onError: (err) =>
      toast.error("Errore aggiornamento bundle", {
        description: err instanceof Error ? err.message : "Errore sconosciuto",
      }),
  });
}

export function useDeleteFeatureBundle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Soft delete via is_active = false (mantiene storico)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("feature_bundles")
        .update({ is_active: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Bundle eliminato");
      qc.invalidateQueries({ queryKey: BUNDLES_KEY });
    },
    onError: (err) =>
      toast.error("Errore eliminazione bundle", {
        description: err instanceof Error ? err.message : "Errore sconosciuto",
      }),
  });
}

/**
 * Applica un bundle a una company: per ogni feature_key del bundle, upsert
 * un override is_enabled=true su company_feature_overrides.
 * Le altre feature non vengono toccate (restano gestite dal piano).
 */
export function useApplyFeatureBundle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ companyId, bundle, userEmail }: {
      companyId: string;
      bundle: FeatureBundle;
      userEmail?: string;
    }) => {
      if (!companyId || !bundle) throw new Error("Parametri mancanti");
      if (!bundle.feature_keys || bundle.feature_keys.length === 0) {
        throw new Error("Bundle senza feature");
      }
      const rows = bundle.feature_keys.map((feature_key) => ({
        company_id: companyId,
        feature_key,
        is_enabled: true,
        notes: `Applicato bundle: ${bundle.name}`,
        set_by_email: userEmail ?? null,
        price_override: null,
      }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("company_feature_overrides")
        .upsert(rows, { onConflict: "company_id,feature_key" });
      if (error) throw error;
      return { applied: rows.length };
    },
    onSuccess: (result, vars) => {
      toast.success(`Bundle "${vars.bundle.name}" applicato (${result.applied} feature)`);
      qc.invalidateQueries({ queryKey: ["admin", "companyFeatureOverrides"] });
      qc.invalidateQueries({ queryKey: ["feature-access"] });
      qc.invalidateQueries({ queryKey: ["feature-flags"] });
    },
    onError: (err) =>
      toast.error("Errore applicazione bundle", {
        description: err instanceof Error ? err.message : "Errore sconosciuto",
      }),
  });
}

/**
 * Applica un set di feature_keys arbitrario (dal Quick Picker custom).
 * Usato dalla pagina pacchetto-custom quando l'admin sceglie feature
 * singolarmente senza partire da un preset.
 */
export function useApplyCustomFeatures() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ companyId, featureKeys, userEmail, notes, expiresAt }: {
      companyId: string;
      featureKeys: { key: string; enabled: boolean; price?: number | null }[];
      userEmail?: string;
      notes?: string;
      expiresAt?: string | null;
    }) => {
      if (!companyId) throw new Error("Company ID mancante");
      const rows = featureKeys.map(({ key, enabled, price }) => ({
        company_id: companyId,
        feature_key: key,
        is_enabled: enabled,
        notes: notes ?? "Configurazione pacchetto custom",
        set_by_email: userEmail ?? null,
        price_override: price ?? null,
        expires_at: expiresAt ?? null,
      }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("company_feature_overrides")
        .upsert(rows, { onConflict: "company_id,feature_key" });
      if (error) throw error;
      return { applied: rows.length };
    },
    onSuccess: (result) => {
      toast.success(`${result.applied} feature configurate`);
      qc.invalidateQueries({ queryKey: ["admin", "companyFeatureOverrides"] });
      qc.invalidateQueries({ queryKey: ["feature-access"] });
      qc.invalidateQueries({ queryKey: ["feature-flags"] });
    },
    onError: (err) =>
      toast.error("Errore configurazione", {
        description: err instanceof Error ? err.message : "Errore sconosciuto",
      }),
  });
}
