/**
 * Preventivatore Verticalizzato Serramentisti — FASE 4.1
 *
 * Mutazioni CRUD su article_families, article_family_axes e
 * article_family_axis_values. Ogni mutazione invalida le query appropriate e
 * logga gli errori su Sentry/Velocity.
 *
 * Decisione architetturale: una hook unica per famiglia + assi + valori. La
 * sequenza "salvataggio famiglia" nell'editor passa per più chiamate
 * (upsert famiglia → diff assi → diff valori) ma ogni step è atomico a
 * livello DB.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { queryKeys } from "@/lib/queryKeys";
import { captureVelocityError } from "@/lib/velocity/sentry";
import type {
  ArticleFamily,
  FamilyAxis,
  AxisValue,
} from "@/types/articleFamily";

// ── Input types ───────────────────────────────────────────────────────────────

export type FamilyInsert = Omit<
  ArticleFamily,
  "id" | "created_at" | "updated_at"
> & {
  id?: string;
};

export type FamilyUpdate = Partial<
  Omit<ArticleFamily, "id" | "company_id" | "created_at" | "updated_at">
>;

export type AxisInsert = Omit<FamilyAxis, "id" | "created_at"> & {
  id?: string;
};

export type AxisUpdate = Partial<
  Omit<FamilyAxis, "id" | "family_id" | "company_id" | "created_at">
>;

export type AxisValueInsert = Omit<AxisValue, "id" | "created_at"> & {
  id?: string;
};

export type AxisValueUpdate = Partial<
  Omit<AxisValue, "id" | "axis_id" | "company_id" | "created_at">
>;

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useFamilyMutations() {
  const qc = useQueryClient();
  const companyId = useEffectiveCompanyId();

  const invalidate = (familyId?: string) => {
    qc.invalidateQueries({ queryKey: queryKeys.articleFamilies.all });
    if (familyId) {
      qc.invalidateQueries({
        queryKey: queryKeys.articleFamilies.detail(familyId),
      });
    }
  };

  // ── Famiglia ──────────────────────────────────────────────────────────────

  const createFamily = useMutation({
    mutationFn: async (payload: Omit<FamilyInsert, "company_id">) => {
      if (!companyId) throw new Error("Azienda non identificata");
      const { data, error } = await supabase
        .from("article_families" as never)
        .insert({ ...payload, company_id: companyId })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return data as unknown as ArticleFamily;
    },
    onSuccess: () => invalidate(),
    onError: (err: Error) =>
      captureVelocityError("families.create", err, { companyId }),
  });

  const updateFamily = useMutation({
    mutationFn: async (args: { id: string; patch: FamilyUpdate }) => {
      if (!companyId) throw new Error("Azienda non identificata");
      const { data, error } = await supabase
        .from("article_families" as never)
        .update(args.patch)
        .eq("id", args.id)
        .eq("company_id", companyId)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return data as unknown as ArticleFamily;
    },
    onSuccess: (f) => invalidate(f.id),
    onError: (err: Error) =>
      captureVelocityError("families.update", err, { companyId }),
  });

  const deleteFamily = useMutation({
    mutationFn: async (familyId: string) => {
      if (!companyId) throw new Error("Azienda non identificata");
      // Soft delete: attivo=false (preserva referenze in quote_items storici)
      const { error } = await supabase
        .from("article_families" as never)
        .update({ attivo: false })
        .eq("id", familyId)
        .eq("company_id", companyId);
      if (error) throw new Error(error.message);
      return familyId;
    },
    onSuccess: (id) => invalidate(id),
    onError: (err: Error) =>
      captureVelocityError("families.delete", err, { companyId }),
  });

  /** Duplica una famiglia con assi+valori (clone profondo). */
  const duplicateFamily = useMutation({
    mutationFn: async (args: { sourceId: string; newName: string }) => {
      if (!companyId) throw new Error("Azienda non identificata");

      // 1. leggi sorgente con assi+valori
      const { data: src, error: errSrc } = await supabase
        .from("article_families" as never)
        .select(
          `*,
           axes:article_family_axes(
             *,
             values:article_family_axis_values(*)
           )`,
        )
        .eq("id", args.sourceId)
        .eq("company_id", companyId)
        .single();
      if (errSrc) throw new Error(errSrc.message);
      const source = src as unknown as ArticleFamily & {
        axes: Array<FamilyAxis & { values: AxisValue[] }>;
      };

      // 2. crea nuova famiglia (senza id, created_at, updated_at)
      const {
        id: _ignoreId,
        created_at: _ignoreCA,
        updated_at: _ignoreUA,
        axes: _ignoreAxes,
        ...famRest
      } = source as ArticleFamily & {
        axes: Array<FamilyAxis & { values: AxisValue[] }>;
      };
      void _ignoreId;
      void _ignoreCA;
      void _ignoreUA;
      void _ignoreAxes;

      const { data: newFam, error: errNew } = await supabase
        .from("article_families" as never)
        .insert({ ...famRest, nome: args.newName })
        .select("id")
        .single();
      if (errNew) throw new Error(errNew.message);
      const newFamilyId = (newFam as unknown as { id: string }).id;

      // 3. per ogni asse, insert + insert valori
      for (const ax of source.axes ?? []) {
        const { data: newAx, error: errAx } = await supabase
          .from("article_family_axes" as never)
          .insert({
            family_id: newFamilyId,
            company_id: companyId,
            nome: ax.nome,
            codice: ax.codice,
            descrizione: ax.descrizione,
            tipo: ax.tipo,
            obbligatorio: ax.obbligatorio,
            sort_order: ax.sort_order,
          })
          .select("id")
          .single();
        if (errAx) throw new Error(errAx.message);
        const newAxisId = (newAx as unknown as { id: string }).id;

        if (ax.values && ax.values.length > 0) {
          const rows = ax.values.map((v) => ({
            axis_id: newAxisId,
            company_id: companyId,
            valore: v.valore,
            label: v.label,
            descrizione: v.descrizione,
            is_default: v.is_default,
            maggiorazione_tipo: v.maggiorazione_tipo,
            maggiorazione_valore: v.maggiorazione_valore,
            maggiorazione_acquisto: v.maggiorazione_acquisto,
            sort_order: v.sort_order,
            attivo: v.attivo,
          }));
          const { error: errVal } = await supabase
            .from("article_family_axis_values" as never)
            .insert(rows);
          if (errVal) throw new Error(errVal.message);
        }
      }

      return newFamilyId;
    },
    onSuccess: () => invalidate(),
    onError: (err: Error) =>
      captureVelocityError("families.duplicate", err, { companyId }),
  });

  // ── Assi ──────────────────────────────────────────────────────────────────

  const createAxis = useMutation({
    mutationFn: async (payload: Omit<AxisInsert, "company_id">) => {
      if (!companyId) throw new Error("Azienda non identificata");
      const { data, error } = await supabase
        .from("article_family_axes" as never)
        .insert({ ...payload, company_id: companyId })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return data as unknown as FamilyAxis;
    },
    onSuccess: (ax) => invalidate(ax.family_id),
    onError: (err: Error) =>
      captureVelocityError("axes.create", err, { companyId }),
  });

  const updateAxis = useMutation({
    mutationFn: async (args: {
      id: string;
      familyId: string;
      patch: AxisUpdate;
    }) => {
      if (!companyId) throw new Error("Azienda non identificata");
      const { data, error } = await supabase
        .from("article_family_axes" as never)
        .update(args.patch)
        .eq("id", args.id)
        .eq("company_id", companyId)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return data as unknown as FamilyAxis;
    },
    onSuccess: (ax) => invalidate(ax.family_id),
    onError: (err: Error) =>
      captureVelocityError("axes.update", err, { companyId }),
  });

  const deleteAxis = useMutation({
    mutationFn: async (args: { id: string; familyId: string }) => {
      if (!companyId) throw new Error("Azienda non identificata");
      const { error } = await supabase
        .from("article_family_axes" as never)
        .delete()
        .eq("id", args.id)
        .eq("company_id", companyId);
      if (error) throw new Error(error.message);
      return args;
    },
    onSuccess: (args) => invalidate(args.familyId),
    onError: (err: Error) =>
      captureVelocityError("axes.delete", err, { companyId }),
  });

  // ── Valori asse ───────────────────────────────────────────────────────────

  const createAxisValue = useMutation({
    mutationFn: async (
      args: Omit<AxisValueInsert, "company_id"> & { familyId: string },
    ) => {
      if (!companyId) throw new Error("Azienda non identificata");
      const { familyId: _fam, ...rest } = args;
      void _fam;
      const { data, error } = await supabase
        .from("article_family_axis_values" as never)
        .insert({ ...rest, company_id: companyId })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return data as unknown as AxisValue;
    },
    onSuccess: (_v, args) => invalidate(args.familyId),
    onError: (err: Error) =>
      captureVelocityError("axis_values.create", err, { companyId }),
  });

  const updateAxisValue = useMutation({
    mutationFn: async (args: {
      id: string;
      familyId: string;
      patch: AxisValueUpdate;
    }) => {
      if (!companyId) throw new Error("Azienda non identificata");
      const { data, error } = await supabase
        .from("article_family_axis_values" as never)
        .update(args.patch)
        .eq("id", args.id)
        .eq("company_id", companyId)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return data as unknown as AxisValue;
    },
    onSuccess: (_v, args) => invalidate(args.familyId),
    onError: (err: Error) =>
      captureVelocityError("axis_values.update", err, { companyId }),
  });

  const deleteAxisValue = useMutation({
    mutationFn: async (args: { id: string; familyId: string }) => {
      if (!companyId) throw new Error("Azienda non identificata");
      const { error } = await supabase
        .from("article_family_axis_values" as never)
        .delete()
        .eq("id", args.id)
        .eq("company_id", companyId);
      if (error) throw new Error(error.message);
      return args;
    },
    onSuccess: (args) => invalidate(args.familyId),
    onError: (err: Error) =>
      captureVelocityError("axis_values.delete", err, { companyId }),
  });

  return {
    createFamily,
    updateFamily,
    deleteFamily,
    duplicateFamily,
    createAxis,
    updateAxis,
    deleteAxis,
    createAxisValue,
    updateAxisValue,
    deleteAxisValue,
  };
}
