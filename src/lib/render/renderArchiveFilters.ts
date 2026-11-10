import type { RecentRenderStatus } from "./recentRenders";

export interface RenderArchiveFilters {
  search: string;
  module: string;
  status: RecentRenderStatus;
  crm: string;
  onlyPlan: boolean;
  page: number;
  view: "grid" | "list" | "projects";
  from: string;
  to: string;
  project: string;
}
export const defaultRenderFilters: RenderArchiveFilters = {
  search: "",
  module: "all",
  status: "completed",
  crm: "all",
  onlyPlan: false,
  page: 1,
  view: "grid",
  from: "",
  to: "",
  project: "all",
};
const validDate = (value: string | null) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
    ? value
    : "";
};
export function readRenderFilters(
  params: URLSearchParams,
): RenderArchiveFilters {
  const status = params.get("stato");
  const page = Number(params.get("pagina") || 1);
  const view = params.get("vista");
  return {
    search: params.get("q") || "",
    module: params.get("modulo") || "all",
    status:
      status &&
      ["all", "completed", "active", "draft", "failed", "stale"].includes(
        status,
      )
        ? (status as RecentRenderStatus)
        : "completed",
    crm: ["linked", "unlinked"].includes(params.get("crm") || "")
      ? params.get("crm")!
      : "all",
    onlyPlan: params.get("pianta") === "1",
    page: Number.isInteger(page) && page > 0 && page <= 1_000_000 ? page : 1,
    view: view === "list" || view === "projects" ? view : "grid",
    from: validDate(params.get("dal")),
    to: validDate(params.get("al")),
    project: params.get("progetto") || "all",
  };
}
export function writeRenderFilters(
  params: URLSearchParams,
  filters: RenderArchiveFilters,
) {
  const next = new URLSearchParams(params);
  const fields: Array<[string, string | null]> = [
    ["q", filters.search || null],
    ["modulo", filters.module !== "all" ? filters.module : null],
    ["stato", filters.status !== "completed" ? filters.status : null],
    ["crm", filters.crm !== "all" ? filters.crm : null],
    ["pianta", filters.onlyPlan ? "1" : null],
    ["pagina", filters.page > 1 ? String(filters.page) : null],
    ["vista", filters.view !== "grid" ? filters.view : null],
    ["dal", filters.from || null],
    ["al", filters.to || null],
    ["progetto", filters.project !== "all" ? filters.project : null],
  ];
  for (const [key, value] of fields) {
    if (value === null) next.delete(key);
    else next.set(key, value);
  }
  return next;
}
