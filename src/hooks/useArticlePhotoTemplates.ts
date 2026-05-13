/**
 * useArticlePhotoTemplates — hook React Query per la galleria globale foto
 * template articoli (article_photo_templates).
 *
 * Caratteristiche:
 *  - Cache lunga (15 min): la galleria cambia raramente, e' gestita centralmente
 *    dal super_admin → fetch frequente non e' necessario
 *  - Filtri opzionali per vertical/categoria/tipologia → query keyed per
 *    sfruttare cache differenziata
 *  - Sort di default: sort_order ASC poi nome ASC
 *
 * Use case principali:
 *  - PhotoTemplatePicker dialog (FamilyEditor Step 1 + MacrocategoriaManager)
 *  - Eventuale futura pagina admin di gestione template
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ArticlePhotoTemplate {
  id: string;
  nome: string;
  descrizione: string | null;
  vertical_slug: string;
  categoria_slug: string | null;
  tipologia: string | null;
  materiale: string | null;
  image_url: string;
  thumbnail_url: string | null;
  tags: string[];
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface PhotoTemplateFilters {
  vertical?: string | null;
  categoria?: string | null;
  tipologia?: string | null;
  search?: string | null;
}

export function useArticlePhotoTemplates(filters: PhotoTemplateFilters = {}) {
  const { vertical, categoria, tipologia, search } = filters;

  return useQuery({
    queryKey: ["article-photo-templates", vertical ?? "*", categoria ?? "*", tipologia ?? "*", search ?? ""],
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from("article_photo_templates")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("nome", { ascending: true });
      if (vertical) q = q.eq("vertical_slug", vertical);
      if (categoria) q = q.eq("categoria_slug", categoria);
      if (tipologia) q = q.eq("tipologia", tipologia);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as ArticlePhotoTemplate[];

      // Filtro search client-side per evitare costo OR ILIKE su DB.
      // Match su nome + descrizione + tags + tipologia.
      if (!search?.trim()) return rows;
      const s = search.trim().toLowerCase();
      return rows.filter((r) => {
        const blob = `${r.nome} ${r.descrizione ?? ""} ${r.tipologia ?? ""} ${r.tags.join(" ")}`.toLowerCase();
        return blob.includes(s);
      });
    },
  });
}
