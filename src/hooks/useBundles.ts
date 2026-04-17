/**
 * Preventivatore Verticalizzato Serramentisti — FASE 10.2
 *
 * Hook di gestione bundle_prodotti + bundle_voci con CRUD completo.
 * Supporta le estensioni FASE 10.1: vertical, tipo_lavoro, is_template,
 * family_id + axis_selections + misure default + vano_label.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { queryKeys } from "@/lib/queryKeys";
import type { AxisSelection } from "@/types/articleFamily";

// ─── Types ────────────────────────────────────────────────────────────────────

export type BundleTipoLavoro = "sostituzione" | "nuova" | "ristrutturazione";

export interface BundleVoce {
  id: string;
  bundle_id: string;
  prodotto_id: string | null;
  tariffa_id: string | null;
  family_id: string | null;
  axis_selections: AxisSelection;
  larghezza_mm_default: number | null;
  altezza_mm_default: number | null;
  vano_label: string | null;
  quantita: number;
  sort_order: number;
  // Joined
  article_templates?: {
    name: string;
    unit_price?: number | null;
    prezzo_vendita?: number;
    prezzo_acquisto_netto?: number;
    unit_of_measure?: string | null;
  } | null;
  tariffe_aziendali?: {
    nome: string;
    prezzo_vendita?: number;
    unita?: string | null;
  } | null;
  article_families?: {
    nome: string;
    modalita_prezzo_base: string;
  } | null;
}

export interface Bundle {
  id: string;
  company_id: string;
  nome: string;
  descrizione: string | null;
  sconto_bundle_pct: number;
  attivo: boolean;
  vertical: string | null;
  tipo_lavoro: BundleTipoLavoro | null;
  is_template: boolean;
  created_at: string;
  voci?: BundleVoce[];
}

export type BundleVoceInput = Omit<BundleVoce, "id" | "bundle_id"> & {
  id?: string;
};

export interface BundleUpsertInput {
  id?: string;
  nome: string;
  descrizione?: string | null;
  sconto_bundle_pct?: number;
  attivo?: boolean;
  vertical?: string | null;
  tipo_lavoro?: BundleTipoLavoro | null;
  is_template?: boolean;
  voci: BundleVoceInput[];
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useBundlesList(filters?: { vertical?: string; tipoLavoro?: BundleTipoLavoro }) {
  const companyId = useEffectiveCompanyId();

  const query = useQuery({
    queryKey: queryKeys.bundles.list(companyId ?? undefined, filters),
    enabled: !!companyId,
    queryFn: async (): Promise<Bundle[]> => {
      let q = supabase.from("bundle_prodotti" as never)
        .select(
          `*,
           voci:bundle_voci(
             *,
             article_templates(name, unit_price, prezzo_vendita, prezzo_acquisto_netto, unit_of_measure),
             tariffe_aziendali(nome, prezzo_vendita, unita),
             article_families(nome, modalita_prezzo_base)
           )`,
        )
        .eq("company_id", companyId!)
        .order("nome");

      if (filters?.vertical) q = q.eq("vertical", filters.vertical);
      if (filters?.tipoLavoro) q = q.eq("tipo_lavoro", filters.tipoLavoro);

      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as Bundle[];
    },
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  return {
    bundles: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useBundle(bundleId: string | null | undefined) {
  const query = useQuery({
    queryKey: queryKeys.bundles.detail(bundleId ?? undefined),
    enabled: !!bundleId,
    queryFn: async (): Promise<Bundle | null> => {
      const { data, error } = await supabase.from("bundle_prodotti" as never)
        .select(
          `*,
           voci:bundle_voci(
             *,
             article_templates(name, unit_price, prezzo_vendita, prezzo_acquisto_netto, unit_of_measure),
             tariffe_aziendali(nome, prezzo_vendita, unita),
             article_families(nome, modalita_prezzo_base)
           )`,
        )
        .eq("id", bundleId!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      return data as Bundle;
    },
    staleTime: 1 * 60 * 1000,
  });

  return {
    bundle: query.data ?? null,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

export function useUpsertBundle() {
  const qc = useQueryClient();
  const companyId = useEffectiveCompanyId();

  return useMutation({
    mutationFn: async (input: BundleUpsertInput) => {
      if (!companyId) throw new Error("Company non identificata");

      // 1) Upsert master
      const masterPayload = {
        company_id: companyId,
        nome: input.nome,
        descrizione: input.descrizione ?? null,
        sconto_bundle_pct: input.sconto_bundle_pct ?? 0,
        attivo: input.attivo ?? true,
        vertical: input.vertical ?? null,
        tipo_lavoro: input.tipo_lavoro ?? null,
        is_template: input.is_template ?? false,
      };

      let bundleId = input.id;
      if (bundleId) {
        const { error } = await supabase.from("bundle_prodotti" as never)
          .update(masterPayload)
          .eq("id", bundleId);
        if (error) throw new Error(error.message);
      } else {
        const { data, error } = await supabase.from("bundle_prodotti" as never)
          .insert(masterPayload)
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        bundleId = (data as { id: string }).id;
      }

      // 2) Replace voci (cleaner than diffing — small lists).
      const { error: delErr } = await supabase.from("bundle_voci" as never)
        .delete()
        .eq("bundle_id", bundleId!);
      if (delErr) throw new Error(delErr.message);

      if (input.voci.length > 0) {
        const voceRows = input.voci.map((v, idx) => ({
          bundle_id: bundleId,
          prodotto_id: v.prodotto_id ?? null,
          tariffa_id: v.tariffa_id ?? null,
          family_id: v.family_id ?? null,
          axis_selections: v.axis_selections ?? {},
          larghezza_mm_default: v.larghezza_mm_default ?? null,
          altezza_mm_default: v.altezza_mm_default ?? null,
          vano_label: v.vano_label ?? null,
          quantita: v.quantita,
          sort_order: v.sort_order ?? idx,
        }));
        const { error: insErr } = await supabase.from("bundle_voci" as never)
          .insert(voceRows);
        if (insErr) throw new Error(insErr.message);
      }

      return bundleId!;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.bundles.all });
      qc.invalidateQueries({ queryKey: ["bundle-prodotti"] });
    },
  });
}

export function useDeleteBundle() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (bundleId: string) => {
      const { error } = await supabase.from("bundle_prodotti" as never)
        .delete()
        .eq("id", bundleId);
      if (error) throw new Error(error.message);
      return bundleId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.bundles.all });
      qc.invalidateQueries({ queryKey: ["bundle-prodotti"] });
    },
  });
}

export function useToggleBundleAttivo() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, attivo }: { id: string; attivo: boolean }) => {
      const { error } = await supabase.from("bundle_prodotti" as never)
        .update({ attivo })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.bundles.all });
      qc.invalidateQueries({ queryKey: ["bundle-prodotti"] });
    },
  });
}
