/**
 * useArticleFamilyTemplates — hook React Query per la galleria globale
 * dei TEMPLATE ARTICOLI (article_family_templates).
 *
 * Differenza da useArticlePhotoTemplates:
 *  - foto template = solo immagine (URL CDN).
 *  - family template = struttura completa (assi/valori/griglia/IVA) pronta
 *    da clonare in article_families dell'azienda corrente.
 *
 * L'import effettivo passa per la RPC `import_article_family_template`
 * lato DB → vedi `useImportArticleFamilyTemplate` per la mutazione.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FamilyTemplateAxisValue {
  valore: string;
  label: string;
  descrizione?: string | null;
  is_default?: boolean;
  maggiorazione_tipo?: "none" | "percentuale" | "fisso_pz" | "fisso_mq" | "fisso_ml" | "fisso_mc";
  maggiorazione_valore?: number;
  sort_order?: number;
}

export interface FamilyTemplateAxis {
  nome: string;
  codice: string;
  descrizione?: string | null;
  tipo?: "discrete" | "boolean";
  obbligatorio?: boolean;
  sort_order?: number;
  values: FamilyTemplateAxisValue[];
}

export interface ArticleFamilyTemplate {
  id: string;
  nome: string;
  descrizione: string | null;
  vertical_slug: string;
  categoria_slug: string | null;
  tipologia: string | null;
  materiale: string | null;
  image_url: string | null;
  thumbnail_url: string | null;
  tags: string[];
  modalita_prezzo_base: "pz" | "mq" | "griglia" | "misura_libera";
  prezzo_base_vendita: number | null;
  vat_rate: number | null;
  unit_of_measure: string | null;
  griglia_asse_x_label: string | null;
  griglia_asse_y_label: string | null;
  griglia_unita: string | null;
  assi_default: FamilyTemplateAxis[];
  griglia_default: unknown | null;
  custom_field_defaults: Record<string, unknown>;
  is_active: boolean;
  sort_order: number;
}

export interface FamilyTemplateFilters {
  vertical?: string | null;
  categoria?: string | null;
  tipologia?: string | null;
  search?: string | null;
}

export function useArticleFamilyTemplates(filters: FamilyTemplateFilters = {}) {
  const { vertical, categoria, tipologia, search } = filters;
  return useQuery({
    queryKey: [
      "article-family-templates",
      vertical ?? "*",
      categoria ?? "*",
      tipologia ?? "*",
      search ?? "",
    ],
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from("article_family_templates")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("nome", { ascending: true });
      if (vertical) q = q.eq("vertical_slug", vertical);
      if (categoria) q = q.eq("categoria_slug", categoria);
      if (tipologia) q = q.eq("tipologia", tipologia);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as ArticleFamilyTemplate[];
      if (!search?.trim()) return rows;
      const s = search.trim().toLowerCase();
      return rows.filter((r) => {
        const blob = `${r.nome} ${r.descrizione ?? ""} ${r.tipologia ?? ""} ${r.materiale ?? ""} ${r.tags.join(" ")}`.toLowerCase();
        return blob.includes(s);
      });
    },
  });
}

/**
 * Mutation: importa un template articolo dentro article_families dell'azienda
 * corrente via RPC `import_article_family_template`. Restituisce l'id della
 * famiglia creata, da usare per redirect a /listino/famiglie/{id} o simili.
 */
export function useImportArticleFamilyTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      templateId: string;
      companyId: string;
      categoriaId?: string | null;
      nomeOverride?: string | null;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc(
        "import_article_family_template",
        {
          p_template_id: params.templateId,
          p_company_id: params.companyId,
          p_categoria_id: params.categoriaId ?? null,
          p_nome_override: params.nomeOverride ?? null,
        },
      );
      if (error) throw error;
      return data as string; // family id
    },
    onSuccess: () => {
      // Invalidation chirurgica: SOLO le query che leggono article_families
      // o le sue derivate. Evitiamo prefix-match larghi tipo "family" che
      // intercettavano family-editor, family-axes, family-grid... causando
      // ri-fetch a cascata di stati locali non correlati.
      void qc.invalidateQueries({ queryKey: ["article-families"] });
      void qc.invalidateQueries({ queryKey: ["article_families"] });
      void qc.invalidateQueries({ queryKey: ["families"] });
      void qc.invalidateQueries({ queryKey: ["listino-families"] });
      void qc.invalidateQueries({ queryKey: ["article-templates-full"] });
      void qc.invalidateQueries({ queryKey: ["article-templates"] });
    },
  });
}
