/**
 * useListinoMacrocategorie — Catalogo a 3 livelli (Sprint A §4.4).
 *
 * Gestisce le MACROCATEGORIE listino (primo livello della gerarchia):
 *   listino_macrocategorie
 *     └─ listino_categorie (via macrocategoria_id)
 *         └─ article_families (via categoria_id)
 *
 * Esempio business:
 *   Macrocategoria: "INFISSO MODELLO 1"
 *     Categoria: "FINESTRA 1 ANTA" → N article_families
 *     Categoria: "PORTA FINESTRA 2 ANTE" → N article_families
 *
 * Restituisce query + mutations (create, update, delete, reorder).
 * Invalidation coordinata: quando cambia una macrocat, invalida anche le
 * categorie (dipendono dalla FK) e il catalog delle famiglie.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";

export interface ListinoMacrocategoria {
  id: string;
  company_id: string;
  nome: string;
  descrizione: string | null;
  icona: string | null;
  colore: string | null;
  sort_order: number;
  attivo: boolean;
  created_at: string;
  updated_at: string;
}

export interface MacrocategoriaPayload {
  nome: string;
  descrizione?: string | null;
  icona?: string | null;
  colore?: string | null;
  sort_order?: number;
  attivo?: boolean;
}

// ─────────────────────────────────────────────────────────────
// Query
// ─────────────────────────────────────────────────────────────

export function useListinoMacrocategorie() {
  const companyId = useEffectiveCompanyId();

  const query = useQuery<ListinoMacrocategoria[]>({
    queryKey: ["listino-macrocategorie", companyId],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        // Tipi non rigenerati: cast a never per evitare "Property ... does not exist"
        .from("listino_macrocategorie" as never)
        .select("*")
        .eq("company_id", companyId!)
        .order("sort_order", { ascending: true })
        .order("nome", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ListinoMacrocategoria[];
    },
  });

  return {
    macrocategorie: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

// ─────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────

export function useMacrocategorieMutations() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["listino-macrocategorie", companyId] });
    void qc.invalidateQueries({ queryKey: ["listino-categorie", companyId] });
    void qc.invalidateQueries({ queryKey: ["listino-categorie-for-families", companyId] });
    void qc.invalidateQueries({ queryKey: ["listino-categorie-for-editor", companyId] });
    void qc.invalidateQueries({ queryKey: ["catalog-categories", companyId] });
    // M2 (audit): quando una macrocategoria cambia, categorie → famiglie →
    // article-templates ereditano il cambio. Invalida tutto il sottoalbero.
    void qc.invalidateQueries({ queryKey: ["article_families"] });
    void qc.invalidateQueries({ queryKey: ["families"] });
    void qc.invalidateQueries({ queryKey: ["article-templates-pro", companyId] });
    void qc.invalidateQueries({ queryKey: ["article-templates-full"] });
    void qc.invalidateQueries({ queryKey: ["article-templates"] });
    void qc.invalidateQueries({ queryKey: ["catalog", "article-templates", companyId] });
  };

  const create = useMutation({
    mutationFn: async (payload: MacrocategoriaPayload): Promise<ListinoMacrocategoria> => {
      if (!companyId) throw new Error("Company non disponibile");
      const { data, error } = await supabase
        .from("listino_macrocategorie" as never)
        .insert({
          company_id: companyId,
          nome: payload.nome.trim(),
          descrizione: payload.descrizione?.trim() || null,
          icona: payload.icona ?? null,
          colore: payload.colore ?? null,
          sort_order: payload.sort_order ?? 0,
          attivo: payload.attivo ?? true,
        } as never)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as unknown as ListinoMacrocategoria;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<MacrocategoriaPayload>;
    }): Promise<ListinoMacrocategoria> => {
      const { data, error } = await supabase
        .from("listino_macrocategorie" as never)
        .update({
          ...(patch.nome !== undefined ? { nome: patch.nome.trim() } : {}),
          ...(patch.descrizione !== undefined
            ? { descrizione: patch.descrizione?.trim() || null }
            : {}),
          ...(patch.icona !== undefined ? { icona: patch.icona } : {}),
          ...(patch.colore !== undefined ? { colore: patch.colore } : {}),
          ...(patch.sort_order !== undefined ? { sort_order: patch.sort_order } : {}),
          ...(patch.attivo !== undefined ? { attivo: patch.attivo } : {}),
        } as never)
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as unknown as ListinoMacrocategoria;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from("listino_macrocategorie" as never)
        .delete()
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });

  return {
    createMacrocategoria: create,
    updateMacrocategoria: update,
    deleteMacrocategoria: remove,
  };
}
