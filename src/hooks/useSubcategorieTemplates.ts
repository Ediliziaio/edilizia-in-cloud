/**
 * useSubcategorieTemplates — hook React Query per i suggerimenti di
 * subcategorie standard per verticale (vertical_subcategorie_templates).
 *
 * Use case: subito dopo aver creato una macrocategoria, propone al
 * commerciale di accettare in bulk N subcategorie standard del settore
 * (es. Serramenti → Infissi/Persiane/Tapparelle/Zanzariere/Inferriate).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SubcategoriaTemplate {
  id: string;
  vertical_slug: string;
  macro_slug: string | null;
  nome: string;
  descrizione: string | null;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
}

export function useSubcategorieTemplates(vertical: string | null | undefined) {
  return useQuery({
    queryKey: ["vertical-subcategorie-templates", vertical ?? "*"],
    enabled: !!vertical,
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vertical_subcategorie_templates")
        .select("*")
        .eq("is_active", true)
        .eq("vertical_slug", vertical)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SubcategoriaTemplate[];
    },
  });
}

/**
 * Mutation: applica una lista di template_ids come categorie sotto una
 * macrocategoria, via RPC `apply_subcategorie_template`. Idempotente:
 * salta le subcategorie già esistenti con lo stesso nome.
 */
export function useApplySubcategorieTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { macrocategoriaId: string; templateIds: string[] }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc(
        "apply_subcategorie_template",
        {
          p_macrocategoria_id: params.macrocategoriaId,
          p_template_ids: params.templateIds,
        },
      );
      if (error) throw error;
      return (data ?? []) as string[];
    },
    onSuccess: () => {
      // Invalidation chirurgica: solo le query del listino categorie/macro
      // e i loro alias usati nel preventivatore. Niente prefix-match larghi.
      void qc.invalidateQueries({ queryKey: ["listino-categorie"] });
      void qc.invalidateQueries({ queryKey: ["listino-categorie-for-families"] });
      void qc.invalidateQueries({ queryKey: ["listino-categorie-for-editor"] });
      void qc.invalidateQueries({ queryKey: ["catalog-categories"] });
      void qc.invalidateQueries({ queryKey: ["listino-macrocategorie"] });
      void qc.invalidateQueries({ queryKey: ["sr-listino-macrocategorie"] });
    },
  });
}
