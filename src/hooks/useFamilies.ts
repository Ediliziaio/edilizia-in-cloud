/**
 * Preventivatore Verticalizzato Serramentisti — FASE 4.1
 *
 * Hook di lettura per le famiglie articoli verticalizzate, inclusi assi e
 * valori ammessi. Single round-trip tramite nested select Supabase.
 *
 * I tipi generati supabase non includono ancora le nuove tabelle (non è stata
 * rigenerata types.ts dopo FASE 2); usiamo `as never` sul from() — stesso
 * pattern di useArticoliNative.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { queryKeys } from "@/lib/queryKeys";
import type {
  ArticleFamily,
  FamilyAxis,
  AxisValue,
  FamilyWithAxes,
} from "@/types/articleFamily";

/**
 * Carica tutte le famiglie attive della company corrente, con gli assi e i
 * valori annidati. Ordinamento: famiglie per sort_order, assi per sort_order,
 * valori per sort_order.
 *
 * IMPORTANT: filtra `deleted_at IS NULL` per escludere gli elementi nel
 * cestino (soft-delete). Per la lista cestino usare `useFamiliesCestino`.
 */
export function useFamilies(options?: { includeInactive?: boolean }) {
  // Di default carica solo gli articoli attivi: è la fonte del preventivatore/
  // QuoteBuilder, che NON deve mai vedere articoli disattivati. La pagina di
  // gestione Listino passa includeInactive per poterli vedere/riattivare e usa
  // una queryKey distinta, così le due cache non si calpestano.
  const includeInactive = options?.includeInactive ?? false;
  const companyId = useEffectiveCompanyId();

  const query = useQuery({
    queryKey: includeInactive
      ? ([...queryKeys.articleFamilies.list(companyId ?? undefined), "with-inactive"] as const)
      : queryKeys.articleFamilies.list(companyId ?? undefined),
    enabled: !!companyId,
    queryFn: async (): Promise<FamilyWithAxes[]> => {
      const { data, error } = await supabase
        .from("article_families" as never)
        .select(
          `*,
           axes:article_family_axes(
             *,
             values:article_family_axis_values(*)
           )`,
        )
        .eq("company_id", companyId!)
        .in("attivo", includeInactive ? [true, false] : [true])
        .is("deleted_at", null)
        // Tie-breaker sul nome: quasi tutti gli articoli hanno sort_order=0
        // (default) e senza secondo criterio Postgres non garantisce un
        // ordine stabile tra refetch → gli articoli "saltellano" in lista.
        .order("sort_order", { ascending: true })
        .order("nome", { ascending: true });
      if (error) throw new Error(error.message);

      const rows = (data ?? []) as unknown as Array<
        ArticleFamily & {
          axes: Array<FamilyAxis & { values: AxisValue[] }>;
        }
      >;

      // Ordina assi e valori lato client: Supabase non garantisce l'ordine
      // nei nested select.
      return rows.map((f) => ({
        ...f,
        axes: [...(f.axes ?? [])]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((ax) => ({
            ...ax,
            values: [...(ax.values ?? [])].sort(
              (a, b) => a.sort_order - b.sort_order,
            ),
          })),
      }));
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  return {
    families: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Carica una singola famiglia con assi e valori. Usato dall'editor.
 */
export function useFamily(familyId: string | null | undefined) {
  const companyId = useEffectiveCompanyId();

  const query = useQuery({
    queryKey: queryKeys.articleFamilies.detail(familyId ?? undefined),
    enabled: !!familyId && !!companyId,
    queryFn: async (): Promise<FamilyWithAxes | null> => {
      const { data, error } = await supabase
        .from("article_families" as never)
        .select(
          `*,
           axes:article_family_axes(
             *,
             values:article_family_axis_values(*)
           )`,
        )
        .eq("company_id", companyId!)
        .eq("id", familyId!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;

      const row = data as unknown as ArticleFamily & {
        axes: Array<FamilyAxis & { values: AxisValue[] }>;
      };

      return {
        ...row,
        axes: [...(row.axes ?? [])]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((ax) => ({
            ...ax,
            values: [...(ax.values ?? [])].sort(
              (a, b) => a.sort_order - b.sort_order,
            ),
          })),
      };
    },
    staleTime: 1 * 60 * 1000,
  });

  return {
    family: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Carica le famiglie nel cestino (soft-deleted). Verranno purgate
 * automaticamente 15 giorni dopo la cancellazione dal job pg_cron
 * `cleanup-cestino-article-families-15gg`. Fino ad allora l'utente puo'
 * ripristinarle da UI.
 *
 * NOTA: non carica assi/valori — il cestino è una vista light per scelta
 * (nome + data cancellazione + immagine sono sufficienti per decidere
 * ripristino/eliminazione definitiva).
 */
export function useFamiliesCestino() {
  const companyId = useEffectiveCompanyId();

  const query = useQuery({
    queryKey: [...queryKeys.articleFamilies.all, "cestino", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<ArticleFamily[]> => {
      const { data, error } = await supabase
        .from("article_families" as never)
        .select("*")
        .eq("company_id", companyId!)
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ArticleFamily[];
    },
    staleTime: 30 * 1000,
  });

  return {
    cestino: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
