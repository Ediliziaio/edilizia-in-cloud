import { useCallback, useEffect, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { classificaBozzeRender } from "./renderDrafts";
import {
  loadRenderGalleryMeta,
  resolveRenderGalleryMeta,
} from "./renderGalleryMeta";
import { loadRenderPlanOrigins } from "./renderPlanOrigin";
import { normalizeRenderStatus } from "./renderStatus";
import type { RecentRender } from "./recentRenders";

export const RENDER_HISTORY_BATCH = 96;
export async function loadRenderHistoryPage(
  companyId: string,
  module: string | undefined,
  offset: number,
  signal?: AbortSignal,
) {
  if (!companyId) throw new Error("Azienda non disponibile.");
  let query = supabase
    .from("company_renders_recent" as never)
    .select(
      "id,status,result_url,result_urls,created_at,render_type,created_by,contact_id,opportunity_id" as never,
      { count: "exact" },
    )
    .eq("company_id", companyId);
  if (module) query = query.eq("render_type", module);
  query = query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .order("render_type", { ascending: true })
    .range(offset, offset + RENDER_HISTORY_BATCH - 1);
  if (signal) query = query.abortSignal(signal);
  const { data, error, count } = await query;
  if (error) throw new Error("Impossibile caricare lo storico dei render.");
  const rows = await classificaBozzeRender(
    (data ?? []) as unknown as Omit<RecentRender, "meta">[],
    companyId,
  );
  const [maps, origins] = await Promise.all([
    loadRenderGalleryMeta(rows),
    loadRenderPlanOrigins(rows, companyId),
  ]);
  return {
    rows: rows.map((row) => ({
      ...row,
      meta: resolveRenderGalleryMeta(row, maps),
      planOrigin: origins[row.id],
    })),
    total: count,
    next:
      count !== null
        ? offset + rows.length < count
          ? offset + rows.length
          : undefined
        : rows.length === RENDER_HISTORY_BATCH
          ? offset + rows.length
          : undefined,
  };
}

export function useRenderHistory(
  companyId: string | undefined,
  module?: string,
  enabled = true,
) {
  const [scanAll, setScanAll] = useState(false);
  const expandHistory = useCallback(() => setScanAll(true), []);
  const query = useInfiniteQuery({
    queryKey: ["render-history", companyId, module ?? "all"],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      loadRenderHistoryPage(companyId!, module, pageParam, signal),
    getNextPageParam: (page) => page.next,
    enabled: !!companyId && enabled,
    retry: 1,
    staleTime: 30_000,
    refetchInterval: (q) =>
      q.state.data?.pages.some((page) =>
        page.rows.some((row) =>
          ["processing", "pending"].includes(normalizeRenderStatus(row.status)),
        ),
      )
        ? 15_000
        : false,
  });
  const {
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage,
  } = query;
  useEffect(() => {
    if (scanAll && hasNextPage && !isFetchingNextPage && !isFetchNextPageError)
      void fetchNextPage();
  }, [
    scanAll,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage,
  ]);
  const items = [
    ...new Map(
      (query.data?.pages.flatMap((page) => page.rows) ?? []).map((row) => [
        `${row.render_type}:${row.id}`,
        row,
      ]),
    ).values(),
  ];
  return {
    ...query,
    items,
    total: query.data?.pages[0]?.total ?? items.length,
    scanAll,
    expandHistory,
  };
}
