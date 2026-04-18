/**
 * Hooks: Linee prodotto fornitore (supplier_product_lines) — STEP 2.
 *
 * Espone:
 *  - useSupplierProductLines({ supplierCatalogId? })  → lista linee
 *      - se supplierCatalogId → filtra per fornitore
 *      - altrimenti → tutte le linee dell'azienda
 *  - useSupplierProductLineMutations()                 → { create, update, remove }
 *
 * Convenzioni:
 *  - Soft delete via attivo=false (analoga a supplier_catalogs).
 *  - RLS + filtro defensive-in-depth su company_id.
 *  - La validazione materiale ∈ enum sta nel CHECK a DB; qui gli helper TS
 *    passano un type `MaterialeProfilo` che coincide già con il CHECK.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { queryKeys } from "@/lib/queryKeys";
import { captureVelocityError } from "@/lib/velocity/sentry";
import type {
  MaterialeProfilo,
  SupplierProductLine,
} from "../types";

// ─── Input types ─────────────────────────────────────────────────────────────

export type SupplierProductLineInsert = Omit<
  SupplierProductLine,
  "id" | "company_id" | "created_at" | "updated_at" | "materiale"
> & {
  materiale?: MaterialeProfilo;
};

export type SupplierProductLineUpdate = Partial<
  Omit<SupplierProductLine, "id" | "company_id" | "created_at" | "updated_at">
>;

// ─── Read ────────────────────────────────────────────────────────────────────

interface UseSupplierProductLinesOptions {
  /** Filtra solo le linee di un fornitore specifico (passare catalog.id). */
  supplierCatalogId?: string | null;
  /** Se true include anche soft-deleted. Default false. */
  includeInactive?: boolean;
  /** Query disabilitata se false — utile per caricare on-demand. */
  enabled?: boolean;
}

export function useSupplierProductLines(
  options?: UseSupplierProductLinesOptions,
) {
  const companyId = useEffectiveCompanyId();
  const supplierCatalogId = options?.supplierCatalogId ?? null;
  const includeInactive = options?.includeInactive ?? false;
  const enabled = options?.enabled ?? true;

  const baseKey = supplierCatalogId
    ? queryKeys.supplierProductLines.byCatalog(supplierCatalogId)
    : queryKeys.supplierProductLines.list(companyId ?? undefined);

  const query = useQuery({
    queryKey: [...baseKey, includeInactive],
    enabled: !!companyId && enabled,
    queryFn: async (): Promise<SupplierProductLine[]> => {
      let q = supabase
        .from("supplier_product_lines")
        .select("*")
        .eq("company_id", companyId!)
        .order("nome", { ascending: true });
      if (supplierCatalogId) q = q.eq("supplier_catalog_id", supplierCatalogId);
      if (!includeInactive) q = q.eq("attivo", true);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as SupplierProductLine[];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  return {
    lines: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export function useSupplierProductLineMutations() {
  const qc = useQueryClient();
  const companyId = useEffectiveCompanyId();

  const invalidate = (supplierCatalogId?: string) => {
    qc.invalidateQueries({ queryKey: queryKeys.supplierProductLines.all });
    if (supplierCatalogId) {
      qc.invalidateQueries({
        queryKey: queryKeys.supplierProductLines.byCatalog(supplierCatalogId),
      });
    }
  };

  const create = useMutation({
    mutationFn: async (
      payload: SupplierProductLineInsert,
    ): Promise<SupplierProductLine> => {
      if (!companyId) throw new Error("Azienda non identificata");
      const { data, error } = await supabase
        .from("supplier_product_lines")
        .insert({ ...payload, company_id: companyId })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return data as SupplierProductLine;
    },
    onSuccess: (line) => invalidate(line.supplier_catalog_id),
    onError: (err: Error) =>
      captureVelocityError(
        "serramenti-listini.supplier_product_lines.create",
        err,
        { companyId },
      ),
  });

  const update = useMutation({
    mutationFn: async (args: {
      id: string;
      supplierCatalogId: string;
      patch: SupplierProductLineUpdate;
    }): Promise<SupplierProductLine> => {
      if (!companyId) throw new Error("Azienda non identificata");
      const { data, error } = await supabase
        .from("supplier_product_lines")
        .update(args.patch)
        .eq("id", args.id)
        .eq("company_id", companyId)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return data as SupplierProductLine;
    },
    onSuccess: (line) => invalidate(line.supplier_catalog_id),
    onError: (err: Error) =>
      captureVelocityError(
        "serramenti-listini.supplier_product_lines.update",
        err,
        { companyId },
      ),
  });

  /** Soft delete: attivo=false. */
  const remove = useMutation({
    mutationFn: async (args: {
      id: string;
      supplierCatalogId: string;
    }): Promise<{ id: string; supplierCatalogId: string }> => {
      if (!companyId) throw new Error("Azienda non identificata");
      const { error } = await supabase
        .from("supplier_product_lines")
        .update({ attivo: false })
        .eq("id", args.id)
        .eq("company_id", companyId);
      if (error) throw new Error(error.message);
      return args;
    },
    onSuccess: (args) => invalidate(args.supplierCatalogId),
    onError: (err: Error) =>
      captureVelocityError(
        "serramenti-listini.supplier_product_lines.delete",
        err,
        { companyId },
      ),
  });

  return { create, update, remove };
}
