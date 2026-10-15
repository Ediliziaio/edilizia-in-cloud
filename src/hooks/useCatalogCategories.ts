/**
 * useCatalogCategories — Preventivatore Unificato (Sprint A §4.2).
 *
 * Restituisce le categorie/modelli di catalogo (`listino_categorie`) della
 * company corrente arricchite col conteggio di famiglie + articoli che vi
 * appartengono. Solo le categorie con `total > 0` vengono esposte alla UI.
 *
 * Quando il preventivatore ha più macrocategorie, l'utente prima sceglie
 * la macrocat e poi vede SOLO le categorie sotto di essa: il parametro
 * opzionale `macrocategoriaId` filtra il risultato.
 *
 * Strategia: 3 query in parallelo + merge client-side. Evita RPC custom per
 * non introdurre dipendenze DB nella prima iterazione. Cache 5 minuti.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { queryKeys } from "@/lib/queryKeys";
import { loadCatalogPages } from "@/lib/listino/loadCatalogPages";
import type { CatalogCategory } from "@/types/catalogItem";

/** Riga selezionata da `listino_categorie` (solo le colonne che ci servono). */
interface ListinoCategoriaRow {
  id: string;
  nome: string;
  icona: string | null;
  colore: string | null;
  immagine_url: string | null;
  sort_order: number | null;
  macrocategoria_id: string | null;
}

interface CategoriaIdOnlyRow {
  id: string;
  categoria_id: string | null;
}

export interface UseCatalogCategoriesOptions {
  /** Se valorizzato, mostra solo le categorie sotto questa macrocategoria. */
  macrocategoriaId?: string | null;
}

export function useCatalogCategories(opts: UseCatalogCategoriesOptions = {}) {
  const companyId = useEffectiveCompanyId();
  const macrocategoriaId = opts.macrocategoriaId ?? null;

  return useQuery<CatalogCategory[]>({
    queryKey: queryKeys.catalog.categories(
      companyId ?? undefined,
      macrocategoriaId,
    ),
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    queryFn: async (): Promise<CatalogCategory[]> => {
      const [categorie, famRows, artRows] = await Promise.all([
        loadCatalogPages<ListinoCategoriaRow>((from, to) => {
          let q = supabase
            .from("listino_categorie")
            .select(
              "id, nome, icona, colore, immagine_url, sort_order, macrocategoria_id",
            )
            .eq("company_id", companyId!)
            .order("sort_order")
            .order("nome")
            .order("id");
          if (macrocategoriaId) q = q.eq("macrocategoria_id", macrocategoriaId);
          return q.range(from, to);
        }),
        loadCatalogPages<CategoriaIdOnlyRow>((from, to) =>
          supabase
            .from("article_families" as never)
            .select("id,categoria_id")
            .eq("company_id", companyId!)
            .eq("attivo", true)
            .is("deleted_at", null)
            .order("id")
            .range(from, to),
        ),
        loadCatalogPages<CategoriaIdOnlyRow>((from, to) =>
          supabase
            .from("article_templates")
            .select("id,categoria_id")
            .eq("company_id", companyId!)
            .eq("attivo", true)
            .is("family_id", null)
            .order("id")
            .range(from, to),
        ),
      ]);

      const famCount = new Map<string, number>();
      const artCount = new Map<string, number>();
      for (const f of famRows) {
        if (f.categoria_id)
          famCount.set(f.categoria_id, (famCount.get(f.categoria_id) ?? 0) + 1);
      }
      for (const a of artRows) {
        if (a.categoria_id)
          artCount.set(a.categoria_id, (artCount.get(a.categoria_id) ?? 0) + 1);
      }

      const result: CatalogCategory[] = categorie.map((c) => {
        const cf = famCount.get(c.id) ?? 0;
        const ca = artCount.get(c.id) ?? 0;
        return {
          id: c.id,
          nome: c.nome,
          icona: c.icona,
          colore: c.colore,
          immagine_url: c.immagine_url,
          sort_order: c.sort_order ?? 0,
          macrocategoria_id: c.macrocategoria_id,
          count_families: cf,
          count_articles: ca,
          total: cf + ca,
        };
      });

      // Nasconde le categorie vuote allo Stadio 1: niente tile inutili.
      return result.filter((c) => c.total > 0);
    },
  });
}
