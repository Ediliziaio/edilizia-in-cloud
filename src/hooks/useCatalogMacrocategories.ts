/**
 * useCatalogMacrocategories — Preventivatore Unificato (Sprint A §4.2 ext.)
 *
 * Restituisce le MACROCATEGORIE di catalogo (`listino_macrocategorie`) della
 * company corrente arricchite col conteggio:
 *   - count_categories: # di categorie/modelli sotto la macrocat (con ≥1 prodotto)
 *   - count_products: # totale di prodotti annidati (famiglie + articoli)
 *
 * Solo le macrocategorie con `count_products > 0` vengono esposte alla UI.
 * Quando esiste 1 sola macrocategoria, il flow del preventivatore può
 * auto-skiparla portando l'utente direttamente alla scelta dei modelli.
 *
 * Strategia: query batch + merge client-side. Cache 5 minuti.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { queryKeys } from "@/lib/queryKeys";
import type { CatalogMacrocategory } from "@/types/catalogItem";

interface ListinoMacrocategoriaRow {
  id: string;
  nome: string;
  descrizione: string | null;
  icona: string | null;
  colore: string | null;
  sort_order: number | null;
  attivo: boolean | null;
}

interface ListinoCategoriaIdRow {
  id: string;
  macrocategoria_id: string | null;
}

interface CategoriaIdOnlyRow {
  categoria_id: string | null;
}

export function useCatalogMacrocategories() {
  const companyId = useEffectiveCompanyId();

  return useQuery<CatalogMacrocategory[]>({
    queryKey: queryKeys.catalog.macrocategories(companyId ?? undefined),
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    queryFn: async (): Promise<CatalogMacrocategory[]> => {
      const [macrosRes, catsRes, famRes, artRes] = await Promise.all([
        supabase
          .from("listino_macrocategorie")
          .select("id, nome, descrizione, icona, colore, sort_order, attivo")
          .eq("company_id", companyId!)
          .eq("attivo", true)
          .order("sort_order", { ascending: true }),
        supabase
          .from("listino_categorie")
          .select("id, macrocategoria_id")
          .eq("company_id", companyId!),
        supabase
          .from("article_families" as never)
          .select("categoria_id")
          .eq("company_id", companyId!)
          .eq("attivo", true),
        supabase
          .from("article_templates")
          .select("categoria_id")
          .eq("company_id", companyId!)
          .eq("attivo", true),
      ]);

      if (macrosRes.error) throw new Error(macrosRes.error.message);
      if (catsRes.error) throw new Error(catsRes.error.message);
      if (famRes.error) throw new Error(famRes.error.message);
      if (artRes.error) throw new Error(artRes.error.message);

      const macros = ((macrosRes.data ?? []) as unknown) as ListinoMacrocategoriaRow[];
      const cats = ((catsRes.data ?? []) as unknown) as ListinoCategoriaIdRow[];
      const fams = (famRes.data ?? []) as unknown as CategoriaIdOnlyRow[];
      const arts = (artRes.data ?? []) as unknown as CategoriaIdOnlyRow[];

      // Step 1: count prodotti per categoria
      const productsPerCat = new Map<string, number>();
      for (const f of fams) {
        if (f.categoria_id) productsPerCat.set(f.categoria_id, (productsPerCat.get(f.categoria_id) ?? 0) + 1);
      }
      for (const a of arts) {
        if (a.categoria_id) productsPerCat.set(a.categoria_id, (productsPerCat.get(a.categoria_id) ?? 0) + 1);
      }

      // Step 2: per ogni macrocategoria, somma le categorie + prodotti annidati
      const stats = new Map<string, { categorie: number; prodotti: number }>();
      for (const c of cats) {
        if (!c.macrocategoria_id) continue;
        const productsHere = productsPerCat.get(c.id) ?? 0;
        const cur = stats.get(c.macrocategoria_id) ?? { categorie: 0, prodotti: 0 };
        if (productsHere > 0) cur.categorie += 1;
        cur.prodotti += productsHere;
        stats.set(c.macrocategoria_id, cur);
      }

      const result: CatalogMacrocategory[] = macros.map((m) => {
        const s = stats.get(m.id) ?? { categorie: 0, prodotti: 0 };
        return {
          id: m.id,
          nome: m.nome,
          descrizione: m.descrizione,
          icona: m.icona,
          colore: m.colore,
          sort_order: m.sort_order ?? 0,
          count_categories: s.categorie,
          count_products: s.prodotti,
        };
      });

      // Nasconde le macrocategorie senza prodotti
      return result.filter((m) => m.count_products > 0);
    },
  });
}
