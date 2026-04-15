/**
 * useResolveLayoutLive — preview live in-memory durante l'editing.
 *
 * Chiama `get_metric` per ogni widget del layout fornito (tramite useQueries)
 * così la preview si aggiorna in tempo reale anche su dashboard NON salvate.
 * Per dashboard salvate si può continuare a usare `useResolveDashboard`
 * (batch RPC `resolve_dashboard`), che è più efficiente.
 */

import { useQueries } from "@tanstack/react-query";
import { getMetric } from "./api";
import type {
  DashboardLayout,
  ResolvedWidget,
  WidgetFilter,
} from "./types";

interface Args {
  layout: DashboardLayout;
  /** Override globale (es. period selector nell'header builder). */
  overrideFilters?: WidgetFilter | null;
  /** Disabilita la risoluzione (utile in edit mode pre-hydrate). */
  enabled?: boolean;
}

interface Result {
  /** Mappa widget.id -> ResolvedWidget (ok/error/skipped). */
  widgets: Record<string, ResolvedWidget>;
  /** True se almeno una query è in corso. */
  isLoading: boolean;
  isFetching: boolean;
}

export function useResolveLayoutLive({
  layout,
  overrideFilters,
  enabled = true,
}: Args): Result {
  const widgets = layout?.widgets ?? [];
  const globalFilters = layout?.globalFilters ?? {};

  const queries = widgets.map((w) => {
    const cfg = w.config ?? {};
    const isStatic = w.type === "text_markdown" || w.type === "divider";
    const hasMetric = !isStatic && !!cfg.metric;
    const filters: WidgetFilter = {
      ...globalFilters,
      ...(cfg.filter ?? {}),
      ...(overrideFilters ?? {}),
    };
    return {
      queryKey: [
        "dashboard-builder",
        "live-widget",
        w.id,
        cfg.metric ?? null,
        cfg.aggregation ?? null,
        cfg.breakdown ?? "none",
        filters,
      ] as const,
      queryFn: async (): Promise<ResolvedWidget> => {
        try {
          const r = await getMetric({
            metricId: cfg.metric as string,
            filters,
            aggregation: cfg.aggregation ?? null,
            breakdown: cfg.breakdown,
          });
          return {
            status: "ok",
            value: r.value,
            breakdown: r.breakdown,
            meta: r.meta,
          };
        } catch (e) {
          return {
            status: "error",
            error: (e as Error).message,
            metric: cfg.metric,
          };
        }
      },
      enabled: enabled && hasMetric,
      staleTime: 15_000,
    };
  });

  const results = useQueries({ queries });

  const map: Record<string, ResolvedWidget> = {};
  widgets.forEach((w, i) => {
    const cfg = w.config ?? {};
    const isStatic = w.type === "text_markdown" || w.type === "divider";
    if (isStatic) {
      map[w.id] = { status: "skipped", reason: "static_widget" };
      return;
    }
    if (!cfg.metric) {
      map[w.id] = { status: "skipped", reason: "no_metric" };
      return;
    }
    const q = results[i];
    if (q?.data) {
      map[w.id] = q.data;
    } else if (q?.isLoading) {
      map[w.id] = { status: "skipped", reason: "loading" };
    } else {
      map[w.id] = { status: "skipped", reason: "pending" };
    }
  });

  return {
    widgets: map,
    isLoading: results.some((q) => q.isLoading),
    isFetching: results.some((q) => q.isFetching),
  };
}
