/**
 * useListinoCategorie — Catalogo a 3 livelli (Sprint A §4.4).
 *
 * Gestisce le CATEGORIE listino (secondo livello della gerarchia).
 * Supporta filtro opzionale per macrocategoria_id.
 *
 * Esempio: Macrocategoria "INFISSO MODELLO 1" → Categorie
 *   - "FINESTRA 1 ANTA"
 *   - "FINESTRA 2 ANTE"
 *   - "PORTA FINESTRA 1 ANTA"
 *
 * Retrocompatibile: la colonna macrocategoria_id è NULLABLE, quindi le
 * categorie già esistenti restano valide e finiscono nel gruppo
 * "Senza macrocategoria" fino a quando non vengono assegnate.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";

export interface ListinoCategoria {
  id: string;
  company_id: string;
  macrocategoria_id: string | null;
  nome: string;
  descrizione: string | null;
  icona: string | null;
  colore: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CategoriaPayload {
  nome: string;
  descrizione?: string | null;
  icona?: string | null;
  colore?: string | null;
  sort_order?: number;
  macrocategoria_id?: string | null;
}

// ─────────────────────────────────────────────────────────────
// Query
// ─────────────────────────────────────────────────────────────

/**
 * Ritorna tutte le categorie della company.
 * Include macrocategoria_id così il consumer può raggruppare client-side.
 */
export function useListinoCategorie() {
  const companyId = useEffectiveCompanyId();

  const query = useQuery<ListinoCategoria[]>({
    queryKey: ["listino-categorie", companyId],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listino_categorie")
        .select(
          "id, company_id, macrocategoria_id, nome, descrizione, icona, colore, sort_order, created_at, updated_at",
        )
        .eq("company_id", companyId!)
        .order("sort_order", { ascending: true })
        .order("nome", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ListinoCategoria[];
    },
  });

  return {
    categorie: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

// ─────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────

export function useCategorieMutations() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["listino-categorie", companyId] });
    void qc.invalidateQueries({ queryKey: ["listino-categorie-for-families", companyId] });
    void qc.invalidateQueries({ queryKey: ["listino-categorie-for-editor", companyId] });
    void qc.invalidateQueries({ queryKey: ["catalog-categories", companyId] });
    // M2 (audit): quando una categoria cambia (rename/riassegna macro), le view
    // famiglie e article-templates mostrano il nome stale finché non si
    // rigenera la cache. Invalidiamo tutte le query family-scoped.
    void qc.invalidateQueries({ queryKey: ["article_families"] });
    void qc.invalidateQueries({ queryKey: ["families"] });
    void qc.invalidateQueries({ queryKey: ["article-templates-pro", companyId] });
    void qc.invalidateQueries({ queryKey: ["article-templates-full"] });
    void qc.invalidateQueries({ queryKey: ["article-templates"] });
    void qc.invalidateQueries({ queryKey: ["catalog", "article-templates", companyId] });
  };

  const create = useMutation({
    mutationFn: async (payload: CategoriaPayload): Promise<ListinoCategoria> => {
      if (!companyId) throw new Error("Company non disponibile");
      const { data, error } = await supabase
        .from("listino_categorie")
        .insert({
          company_id: companyId,
          nome: payload.nome.trim(),
          descrizione: payload.descrizione?.trim() || null,
          icona: payload.icona ?? null,
          colore: payload.colore ?? null,
          sort_order: payload.sort_order ?? 0,
          macrocategoria_id: payload.macrocategoria_id ?? null,
        } as never)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as unknown as ListinoCategoria;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<CategoriaPayload>;
    }): Promise<ListinoCategoria> => {
      if (!companyId) throw new Error("Company non disponibile");
      const { data, error } = await supabase
        .from("listino_categorie")
        .update({
          ...(patch.nome !== undefined ? { nome: patch.nome.trim() } : {}),
          ...(patch.descrizione !== undefined
            ? { descrizione: patch.descrizione?.trim() || null }
            : {}),
          ...(patch.icona !== undefined ? { icona: patch.icona } : {}),
          ...(patch.colore !== undefined ? { colore: patch.colore } : {}),
          ...(patch.sort_order !== undefined ? { sort_order: patch.sort_order } : {}),
          ...(patch.macrocategoria_id !== undefined
            ? { macrocategoria_id: patch.macrocategoria_id }
            : {}),
        } as never)
        .eq("id", id)
        .eq("company_id", companyId)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as unknown as ListinoCategoria;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      if (!companyId) throw new Error("Company non disponibile");
      const { error } = await supabase
        .from("listino_categorie")
        .delete()
        .eq("id", id)
        .eq("company_id", companyId);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });

  return {
    createCategoria: create,
    updateCategoria: update,
    deleteCategoria: remove,
  };
}
