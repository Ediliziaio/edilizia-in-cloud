/**
 * Hooks: celle griglia prezzi (listino_griglia) — STEP 3.
 *
 * Estensione STEP 3: axis_config + supplier_catalog_id + supplier_product_line_id.
 *
 * Espone:
 *  - useGridCells({ familyId, axisConfig? })  → lista celle della famiglia,
 *    opzionalmente filtrate per axis_config (fascia / variante).
 *  - useGridCellMutations()                    → { upsert, remove }
 *
 * Convenzioni:
 *  - upsert: logica atomica insert-or-update, dedup per
 *    (family_id, COALESCE(axis_config, '{}'), valore_x, valore_y).
 *    Sul client usiamo .upsert con onConflict solo se ID nota; in alternativa
 *    cerchiamo match e decidiamo insert vs update.
 *  - remove: DELETE fisico (non soft) — una cella "mancante" = "nessun prezzo"
 *    per quella combinazione.
 *
 * Cache policy:
 *  - staleTime 1 min: celle cambiano più di frequente (bulk import, editor)
 *  - gcTime 5 min
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { captureVelocityError } from "@/lib/velocity/sentry";
import type { GridCell } from "../types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Canonicalizza axis_config per confronto stabile client-side.
 * Ordina le chiavi alfabeticamente → evita mismatch tra {a,b} e {b,a}.
 * Restituisce null se input null/undefined/vuoto.
 */
function canonicalAxisConfig(
  cfg: Record<string, string> | null | undefined,
): Record<string, string> | null {
  if (!cfg) return null;
  const keys = Object.keys(cfg);
  if (keys.length === 0) return null;
  const sorted: Record<string, string> = {};
  for (const k of keys.sort()) {
    sorted[k] = cfg[k];
  }
  return sorted;
}

/** Serializza axis_config per confronti di uguaglianza (es. filtro cache-side). */
function serializeAxisConfig(
  cfg: Record<string, string> | null | undefined,
): string {
  const canon = canonicalAxisConfig(cfg);
  return canon ? JSON.stringify(canon) : "";
}

// ─── Query keys (locali per evitare proliferazione globale) ─────────────────

const gridCellsKey = {
  all: ["grid-cells"] as const,
  list: (
    familyId: string | undefined,
    axisKey: string,
  ) => ["grid-cells", "list", familyId ?? null, axisKey] as const,
};

// ─── Read ────────────────────────────────────────────────────────────────────

interface UseGridCellsOptions {
  familyId: string | null | undefined;
  /** Se presente, filtra solo le celle con questo axis_config (confronto via jsonb @>) */
  axisConfig?: Record<string, string> | null;
  enabled?: boolean;
}

export function useGridCells(options: UseGridCellsOptions) {
  const companyId = useEffectiveCompanyId();
  const { familyId, axisConfig } = options;
  const canon = canonicalAxisConfig(axisConfig);
  const axisKey = serializeAxisConfig(canon);

  const query = useQuery({
    queryKey: gridCellsKey.list(familyId ?? undefined, axisKey),
    enabled: !!companyId && !!familyId && (options.enabled ?? true),
    queryFn: async (): Promise<GridCell[]> => {
      let q = supabase
        .from("listino_griglia")
        .select(
          "id, company_id, family_id, axis_config, valore_x, valore_y, prezzo_vendita, prezzo_acquisto, supplier_catalog_id, supplier_product_line_id, note",
        )
        .eq("company_id", companyId!)
        .eq("family_id", familyId!)
        .order("valore_y", { ascending: true })
        .order("valore_x", { ascending: true });
      // Filtro axis_config:
      //   - axis=null → carica TUTTE le celle (utile per editor multi-fascia)
      //   - axis={} canonicalizzato → solo celle con questa config
      if (canon) {
        q = q.contains("axis_config", canon).containedBy("axis_config", canon);
      }
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => ({
        id: row.id,
        family_id: row.family_id ?? familyId!,
        axis_config: (row.axis_config ?? null) as Record<string, string> | null,
        valore_x: row.valore_x,
        valore_y: row.valore_y,
        prezzo_vendita: Number(row.prezzo_vendita),
        prezzo_acquisto:
          row.prezzo_acquisto == null ? null : Number(row.prezzo_acquisto),
        supplier_catalog_id: row.supplier_catalog_id,
        supplier_product_line_id: row.supplier_product_line_id,
        note: row.note,
      }));
    },
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  return {
    cells: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export type GridCellUpsert = Omit<GridCell, "id"> & { id?: string };

export function useGridCellMutations() {
  const qc = useQueryClient();
  const companyId = useEffectiveCompanyId();

  const invalidate = (familyId: string) => {
    qc.invalidateQueries({
      queryKey: ["grid-cells", "list", familyId],
      exact: false,
    });
    qc.invalidateQueries({ queryKey: gridCellsKey.all });
  };

  /**
   * Upsert atomico: se (family_id, axis_config, valore_x, valore_y) esiste,
   * aggiorna i campi prezzi/supplier; altrimenti inserisce.
   */
  const upsert = useMutation({
    mutationFn: async (cell: GridCellUpsert): Promise<GridCell> => {
      if (!companyId) throw new Error("Azienda non identificata");
      const canon = canonicalAxisConfig(cell.axis_config);

      // Cerca un match esistente (stesso dedup key)
      let existingQ = supabase
        .from("listino_griglia")
        .select("id")
        .eq("company_id", companyId)
        .eq("family_id", cell.family_id)
        .eq("valore_x", cell.valore_x)
        .eq("valore_y", cell.valore_y);
      if (canon) {
        existingQ = existingQ
          .contains("axis_config", canon)
          .containedBy("axis_config", canon);
      } else {
        existingQ = existingQ.is("axis_config", null);
      }
      const { data: existing, error: errQ } = await existingQ.maybeSingle();
      if (errQ) throw new Error(errQ.message);

      const payload = {
        company_id: companyId,
        family_id: cell.family_id,
        axis_config: canon,
        valore_x: cell.valore_x,
        valore_y: cell.valore_y,
        prezzo_vendita: cell.prezzo_vendita,
        prezzo_acquisto: cell.prezzo_acquisto,
        supplier_catalog_id: cell.supplier_catalog_id,
        supplier_product_line_id: cell.supplier_product_line_id,
        note: cell.note,
      };

      if (existing?.id) {
        const { data, error } = await supabase
          .from("listino_griglia")
          .update(payload)
          .eq("id", existing.id)
          .eq("company_id", companyId)
          .select(
            "id, family_id, axis_config, valore_x, valore_y, prezzo_vendita, prezzo_acquisto, supplier_catalog_id, supplier_product_line_id, note",
          )
          .single();
        if (error) throw new Error(error.message);
        return {
          ...cell,
          id: data.id,
          prezzo_acquisto:
            data.prezzo_acquisto == null ? null : Number(data.prezzo_acquisto),
          prezzo_vendita: Number(data.prezzo_vendita),
          axis_config: (data.axis_config ?? null) as Record<string, string> | null,
        };
      }

      const { data, error } = await supabase
        .from("listino_griglia")
        .insert(payload)
        .select(
          "id, family_id, axis_config, valore_x, valore_y, prezzo_vendita, prezzo_acquisto, supplier_catalog_id, supplier_product_line_id, note",
        )
        .single();
      if (error) throw new Error(error.message);
      return {
        ...cell,
        id: data.id,
        prezzo_acquisto:
          data.prezzo_acquisto == null ? null : Number(data.prezzo_acquisto),
        prezzo_vendita: Number(data.prezzo_vendita),
        axis_config: (data.axis_config ?? null) as Record<string, string> | null,
      };
    },
    onSuccess: (cell) => invalidate(cell.family_id),
    onError: (err: Error) =>
      captureVelocityError("serramenti-listini.grid_cells.upsert", err, {
        companyId,
      }),
  });

  const remove = useMutation({
    mutationFn: async (args: {
      id: string;
      familyId: string;
    }): Promise<{ id: string; familyId: string }> => {
      if (!companyId) throw new Error("Azienda non identificata");
      const { error } = await supabase
        .from("listino_griglia")
        .delete()
        .eq("id", args.id)
        .eq("company_id", companyId);
      if (error) throw new Error(error.message);
      return args;
    },
    onSuccess: (args) => invalidate(args.familyId),
    onError: (err: Error) =>
      captureVelocityError("serramenti-listini.grid_cells.delete", err, {
        companyId,
      }),
  });

  return { upsert, remove };
}
