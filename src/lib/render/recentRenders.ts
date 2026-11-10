import type { RenderGalleryMeta } from "./renderGalleryMeta";
import type { RenderPlanOrigin } from "./renderPlanOrigin";
import { isRenderStale, normalizeRenderStatus } from "./renderStatus";

export interface RecentRender {
  id: string;
  status: string;
  result_url: string | null;
  result_urls?: string[] | null;
  created_at: string;
  render_type: string;
  created_by: string | null;
  contact_id: string | null;
  opportunity_id: string | null;
  meta: RenderGalleryMeta;
  planOrigin?: RenderPlanOrigin;
}

export type RecentRenderStatus = "all" | "completed" | "active" | "draft" | "failed" | "stale";

export function recentRenderImage(item: Pick<RecentRender, "result_url" | "result_urls">): string | null {
  if (item.result_url?.trim()) return item.result_url;
  return item.result_urls?.find((url) => typeof url === "string" && url.trim()) ?? null;
}

export function matchesRecentStatus(item: Pick<RecentRender, "status"> & { created_at?: string }, filter: RecentRenderStatus): boolean {
  const status = normalizeRenderStatus(item.status);
  if (filter === "stale") return isRenderStale(item.status, item.created_at);
  return filter === "all" || (filter === "active" ? status === "pending" || status === "processing" : status === filter);
}

export function recentRenderTitle(item: RecentRender, moduleName: string): string {
  return item.planOrigin?.roomName || item.meta.opportunityName || item.meta.contactName || moduleName;
}

export function matchesRecentSearch(item: RecentRender, query: string, moduleName: string): boolean {
  const normalizza = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("it");
  const words = normalizza(query.trim()).split(/\s+/).filter(Boolean);
  const text = normalizza([
    moduleName, item.planOrigin?.roomName, item.planOrigin?.projectTitle,
    item.meta.contactName, item.meta.opportunityName, item.meta.createdByName,
  ].filter(Boolean).join(" "));
  return words.every((word) => text.includes(word));
}
