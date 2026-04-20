/**
 * useCatalogItems — Preventivatore Unificato (Sprint A §4.4).
 *
 * Sorgente unificata per lo Stadio 2 del dialog. Fonde famiglie e articoli
 * singoli in un'unica lista `CatalogItem[]` filtrabile per categoria +
 * ricerca testuale. Il discriminated union `source` permette al
 * configuratore (Stadio 3) di scegliere il renderer giusto.
 *
 * Strategia: riusa `useFamilies` (che è già cached 5 min) e fa una query
 * diretta su `article_templates` con le sole colonne necessarie. Il merge
 * e i filtri sono memoizzati per non ricalcolare a ogni render.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useFamilies } from "@/hooks/useFamilies";
import { queryKeys } from "@/lib/queryKeys";
import type {
  ArticleTemplateLite,
  CatalogItem,
  CatalogItemArticle,
  CatalogItemFamily,
  ModalitaPrezzoUnified,
} from "@/types/catalogItem";

interface UseCatalogItemsParams {
  /** `null`/`undefined` = tutte le categorie. */
  categoriaId?: string | null;
  /** Ricerca case-insensitive su nome/descrizione/sku. */
  search?: string;
}

/** Fallback sicuro per eventuali modalita_prezzo legacy non mappate. */
function normalizeModalita(raw: string | null | undefined): ModalitaPrezzoUnified {
  if (raw === "mq" || raw === "griglia" || raw === "misura_libera") return raw;
  return "pz";
}

/** Carica gli article_templates attivi della company (solo colonne necessarie). */
function useArticleTemplatesLite() {
  const companyId = useEffectiveCompanyId();

  return useQuery<ArticleTemplateLite[]>({
    queryKey: ["catalog", "article-templates", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    queryFn: async (): Promise<ArticleTemplateLite[]> => {
      const { data, error } = await supabase
        .from("article_templates")
        .select(
          "id, company_id, name, sku, marca, modello, description, " +
            "categoria_id, modalita_prezzo, prezzo_vendita, " +
            "prezzo_acquisto_netto, vat_rate, unit_of_measure, immagine_url, " +
            "pdf_scheda_url, ha_montaggio, montaggio_tariffa_id, " +
            "montaggio_tipo, attivo, sort_order",
        )
        .eq("company_id", companyId!)
        .eq("attivo", true)
        .order("sort_order", { ascending: true });
      if (error) throw new Error(error.message);
      // La colonna `posa_linked` arriva con la migration Step 3; fino a
      // quando i types generati non sono rigenerati, leggiamo in modo
      // difensivo e trattiamo null come true (default spec §4.3).
      const rows = (data ?? []) as unknown as Array<
        Omit<ArticleTemplateLite, "posa_linked"> & { posa_linked?: boolean | null }
      >;
      return rows.map((r) => ({
        ...r,
        posa_linked: r.posa_linked ?? null,
      }));
    },
  });
}

export function useCatalogItems(params: UseCatalogItemsParams = {}) {
  const { categoriaId, search } = params;
  const { families, isLoading: familiesLoading } = useFamilies();
  const { data: articoli, isLoading: articoliLoading } = useArticleTemplatesLite();

  const items: CatalogItem[] = useMemo(() => {
    const famItems: CatalogItemFamily[] = (families ?? [])
      .filter((f) => !categoriaId || f.categoria_id === categoriaId)
      .map((f) => {
        // `posa_linked` arriva dalla migration Step 3. Fino alla rigenerazione
        // dei types potrebbe non essere presente: leggiamo in modo difensivo.
        const posaLinkedRaw = (f as unknown as { posa_linked?: boolean | null }).posa_linked;
        return {
          source: "family" as const,
          id: f.id,
          company_id: f.company_id,
          nome: f.nome,
          descrizione: f.descrizione,
          immagine_url: f.immagine_url,
          pdf_scheda_url: f.pdf_scheda_url,
          categoria_id: f.categoria_id,
          modalita_prezzo: f.modalita_prezzo_base,
          prezzo_base_vendita: f.prezzo_base_vendita,
          unit_of_measure: f.unit_of_measure,
          attivo: f.attivo,
          sort_order: f.sort_order,
          family: f,
          ha_posa_automatica: !!f.posa_tariffa_default_id,
          posa_linked: posaLinkedRaw ?? true,
        };
      });

    const artItems: CatalogItemArticle[] = (articoli ?? [])
      .filter((a) => !categoriaId || a.categoria_id === categoriaId)
      .map((a) => ({
        source: "article" as const,
        id: a.id,
        company_id: a.company_id,
        nome: a.name,
        descrizione: a.description,
        immagine_url: a.immagine_url,
        pdf_scheda_url: a.pdf_scheda_url,
        categoria_id: a.categoria_id,
        modalita_prezzo: normalizeModalita(a.modalita_prezzo),
        prezzo_base_vendita: a.prezzo_vendita ?? 0,
        unit_of_measure: a.unit_of_measure ?? "pz",
        attivo: a.attivo ?? true,
        sort_order: a.sort_order ?? 0,
        article: a,
        sku: a.sku,
        marca: a.marca,
        ha_montaggio_automatico: !!a.montaggio_tariffa_id,
        posa_linked: a.posa_linked ?? true,
      }));

    let merged: CatalogItem[] = [...famItems, ...artItems];

    const q = search?.trim().toLowerCase() ?? "";
    if (q) {
      merged = merged.filter((it) => {
        if (it.nome.toLowerCase().includes(q)) return true;
        if ((it.descrizione ?? "").toLowerCase().includes(q)) return true;
        if (it.source === "article" && (it.sku ?? "").toLowerCase().includes(q))
          return true;
        return false;
      });
    }

    merged.sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.nome.localeCompare(b.nome);
    });

    return merged;
  }, [families, articoli, categoriaId, search]);

  return {
    items,
    isLoading: familiesLoading || articoliLoading,
    queryKey: queryKeys.catalog.items(
      undefined,
      categoriaId ?? null,
    ),
  };
}
