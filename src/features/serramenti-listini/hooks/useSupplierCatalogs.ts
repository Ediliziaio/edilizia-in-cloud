/**
 * Hooks: Fornitori serramenti (supplier_catalogs) — STEP 2.
 *
 * Espone:
 *  - useSupplierCatalogs()          → lista fornitori dell'azienda corrente
 *  - useSupplierCatalogMutations()  → { create, update, remove } (soft delete)
 *
 * Convenzioni:
 *  - company_id è letta da useEffectiveCompanyId (MCA + impersonation safe).
 *  - RLS lato DB garantisce l'isolamento; il filtro .eq("company_id", ...)
 *    è defensive-in-depth e serve anche a keyare la cache.
 *  - Soft delete via attivo=false per non rompere eventuali riferimenti futuri
 *    in listino_griglia (FK supplier_catalog_id dopo STEP 3).
 *  - Logging errori via captureVelocityError (Sentry/Velocity wrapper).
 *
 * Cache policy:
 *  - staleTime 5 min — i fornitori cambiano raramente
 *  - gcTime 15 min
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { queryKeys } from "@/lib/queryKeys";
import { captureVelocityError } from "@/lib/velocity/sentry";
import type { SupplierCatalog } from "../types";

// ─── Input types ─────────────────────────────────────────────────────────────

export type SupplierCatalogInsert = Omit<
  SupplierCatalog,
  "id" | "company_id" | "created_at" | "updated_at"
>;

export type SupplierCatalogUpdate = Partial<
  Omit<SupplierCatalog, "id" | "company_id" | "created_at" | "updated_at">
>;

// ─── Read ────────────────────────────────────────────────────────────────────

/**
 * Lista fornitori attivi dell'azienda corrente ordinati per nome.
 * `includeInactive=true` include anche i soft-deleted (utile in admin/trash).
 */
export function useSupplierCatalogs(options?: { includeInactive?: boolean }) {
  const companyId = useEffectiveCompanyId();
  const includeInactive = options?.includeInactive ?? false;

  const query = useQuery({
    queryKey: [
      ...queryKeys.supplierCatalogs.list(companyId ?? undefined),
      includeInactive,
    ],
    enabled: !!companyId,
    queryFn: async (): Promise<SupplierCatalog[]> => {
      let q = supabase
        .from("supplier_catalogs")
        .select("*")
        .eq("company_id", companyId!)
        .order("nome", { ascending: true });
      if (!includeInactive) q = q.eq("attivo", true);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as SupplierCatalog[];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  return {
    suppliers: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export function useSupplierCatalogMutations() {
  const qc = useQueryClient();
  const companyId = useEffectiveCompanyId();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: queryKeys.supplierCatalogs.all });
  };

  const create = useMutation({
    mutationFn: async (
      payload: SupplierCatalogInsert,
    ): Promise<SupplierCatalog> => {
      if (!companyId) throw new Error("Azienda non identificata");
      const { data, error } = await supabase
        .from("supplier_catalogs")
        .insert({ ...payload, company_id: companyId })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return data as SupplierCatalog;
    },
    onSuccess: () => invalidate(),
    onError: (err: Error) =>
      captureVelocityError("serramenti-listini.supplier_catalogs.create", err, {
        companyId,
      }),
  });

  const update = useMutation({
    mutationFn: async (args: {
      id: string;
      patch: SupplierCatalogUpdate;
    }): Promise<SupplierCatalog> => {
      if (!companyId) throw new Error("Azienda non identificata");
      const { data, error } = await supabase
        .from("supplier_catalogs")
        .update(args.patch)
        .eq("id", args.id)
        .eq("company_id", companyId)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return data as SupplierCatalog;
    },
    onSuccess: () => invalidate(),
    onError: (err: Error) =>
      captureVelocityError("serramenti-listini.supplier_catalogs.update", err, {
        companyId,
      }),
  });

  /** Soft delete: attivo=false. Preserva referenze future (STEP 3 FK). */
  const remove = useMutation({
    mutationFn: async (supplierId: string): Promise<string> => {
      if (!companyId) throw new Error("Azienda non identificata");
      const { error } = await supabase
        .from("supplier_catalogs")
        .update({ attivo: false })
        .eq("id", supplierId)
        .eq("company_id", companyId);
      if (error) throw new Error(error.message);
      return supplierId;
    },
    onSuccess: () => invalidate(),
    onError: (err: Error) =>
      captureVelocityError("serramenti-listini.supplier_catalogs.delete", err, {
        companyId,
      }),
  });

  return { create, update, remove };
}
