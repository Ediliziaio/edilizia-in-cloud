export type OpportunityViewMode = "kanban" | "list";
export type OpportunitySortField = "name" | "value" | "created_at" | "updated_at";
export type OpportunitySortDir = "asc" | "desc";

const VALID_VIEW_MODES = new Set<OpportunityViewMode>(["kanban", "list"]);
const VALID_SORT_FIELDS = new Set<OpportunitySortField>(["name", "value", "created_at", "updated_at"]);
const VALID_SORT_DIRS = new Set<OpportunitySortDir>(["asc", "desc"]);

export interface OpportunityUrlStateInput {
  viewMode: unknown;
  sortField: unknown;
  sortDir: unknown;
  searchInput: unknown;
}

export interface OpportunityUrlState {
  viewMode: OpportunityViewMode;
  sortField: OpportunitySortField;
  sortDir: OpportunitySortDir;
  searchInput: string;
}

export interface OpportunityPipelineLike {
  id: string;
}

export interface OpportunityFiltersLike {
  statuses?: string[];
  assignedTo?: string;
  followerId?: string;
  callCenterId?: string;
  source?: string;
  valueMin?: string;
  valueMax?: string;
  dateFrom?: string;
  dateTo?: string;
  tags?: string[];
}

export interface FilterAndSortOpportunitiesInput<TOpportunity> {
  opportunities: TOpportunity[];
  searchQuery?: unknown;
  filters?: OpportunityFiltersLike;
  onlyMine?: boolean;
  currentUserId?: string | null;
  sortField?: unknown;
  sortDir?: unknown;
}

export function sanitizeOpportunitySearchTerm(value: unknown): string {
  if (value == null) return "";
  return String(value)
    .replace(/[%(),]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeOpportunityUrlState(input: OpportunityUrlStateInput): OpportunityUrlState {
  const viewMode = typeof input.viewMode === "string" && VALID_VIEW_MODES.has(input.viewMode as OpportunityViewMode)
    ? input.viewMode as OpportunityViewMode
    : "kanban";
  const sortField = typeof input.sortField === "string" && VALID_SORT_FIELDS.has(input.sortField as OpportunitySortField)
    ? input.sortField as OpportunitySortField
    : "created_at";
  const sortDir = typeof input.sortDir === "string" && VALID_SORT_DIRS.has(input.sortDir as OpportunitySortDir)
    ? input.sortDir as OpportunitySortDir
    : "desc";

  return {
    viewMode,
    sortField,
    sortDir,
    searchInput: sanitizeOpportunitySearchTerm(input.searchInput),
  };
}

export function resolveOpportunityPipelineId(
  requestedPipelineId: unknown,
  pipelines: OpportunityPipelineLike[],
): string | null {
  if (pipelines.length === 0) return null;
  const requested = typeof requestedPipelineId === "string" ? requestedPipelineId.trim() : "";
  if (requested && pipelines.some((pipeline) => pipeline.id === requested)) return requested;
  return pipelines[0]?.id ?? null;
}

function normalizeNumericFilter(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function isDateOnly(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function getString(value: unknown): string {
  return value == null ? "" : String(value);
}

function normalizeTag(value: unknown): string {
  return getString(value).trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeTags(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    const tag = normalizeTag(value);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    normalized.push(tag);
  }
  return normalized;
}

function getNestedContact(opportunity: Record<string, unknown>): Record<string, unknown> {
  const contact = opportunity.marketing_contacts;
  return contact && typeof contact === "object" ? contact as Record<string, unknown> : {};
}

function normalizeSortField(value: unknown): OpportunitySortField {
  return typeof value === "string" && VALID_SORT_FIELDS.has(value as OpportunitySortField)
    ? value as OpportunitySortField
    : "created_at";
}

function normalizeSortDir(value: unknown): OpportunitySortDir {
  return typeof value === "string" && VALID_SORT_DIRS.has(value as OpportunitySortDir)
    ? value as OpportunitySortDir
    : "desc";
}

/**
 * I filtri della pagina Opportunità nella forma che capiscono le funzioni del
 * database (opportunita_filtrate, migrazione 20280914000013). Solo le chiavi
 * con un valore: un filtro vuoto non viaggia, così la chiave della cache non
 * cambia per un campo lasciato in bianco.
 */
export interface FiltriServerOpportunita {
  cerca?: string;
  stati?: string[];
  venditore?: string;
  follower?: string;
  call_center?: string;
  fonte?: string;
  valore_min?: string;
  valore_max?: string;
  dal?: string;
  al?: string;
  tag?: string[];
  /** «I miei deal»: venditore, call center o follower. */
  miei?: string;
  /** «Vede solo i propri» in «Vista come»: la sessione resta del super admin. */
  visibili_a?: string;
  striscia?: "stallo" | "azioni_scadute";
}

export function filtriPerServer({
  searchQuery = "",
  filters = {},
  onlyMine = false,
  currentUserId = null,
  visibiliA = null,
  striscia = null,
}: {
  searchQuery?: unknown;
  filters?: OpportunityFiltersLike;
  onlyMine?: boolean;
  currentUserId?: string | null;
  visibiliA?: string | null;
  striscia?: "stallo" | "azioni_scadute" | null;
}): FiltriServerOpportunita {
  const out: FiltriServerOpportunita = {};
  const cerca = sanitizeOpportunitySearchTerm(searchQuery).toLowerCase();
  if (cerca) out.cerca = cerca;
  const stati = Array.isArray(filters.statuses) ? filters.statuses.filter(Boolean) : [];
  if (stati.length > 0) out.stati = [...stati].sort();
  if (filters.assignedTo) out.venditore = filters.assignedTo;
  if (filters.followerId) out.follower = filters.followerId;
  if (filters.callCenterId) out.call_center = filters.callCenterId;
  const fonte = sanitizeOpportunitySearchTerm(filters.source).toLowerCase();
  if (fonte) out.fonte = fonte;
  const valoreMin = normalizeNumericFilter(filters.valueMin);
  if (valoreMin !== null) out.valore_min = String(valoreMin);
  const valoreMax = normalizeNumericFilter(filters.valueMax);
  if (valoreMax !== null) out.valore_max = String(valoreMax);
  if (isDateOnly(filters.dateFrom)) out.dal = filters.dateFrom;
  if (isDateOnly(filters.dateTo)) out.al = filters.dateTo;
  const tag = normalizeTags(filters.tags);
  if (tag.length > 0) out.tag = [...tag].sort();
  if (onlyMine && currentUserId) out.miei = currentUserId;
  if (visibiliA) out.visibili_a = visibiliA;
  if (striscia) out.striscia = striscia;
  return out;
}

export function filterAndSortOpportunities<TOpportunity extends Record<string, unknown>>({
  opportunities,
  searchQuery = "",
  filters = {},
  onlyMine = false,
  currentUserId = null,
  sortField = "created_at",
  sortDir = "desc",
}: FilterAndSortOpportunitiesInput<TOpportunity>): TOpportunity[] {
  const searchTokens = sanitizeOpportunitySearchTerm(searchQuery).toLowerCase().split(" ").filter(Boolean);
  const statuses = Array.isArray(filters.statuses) ? filters.statuses.filter(Boolean) : [];
  const tags = normalizeTags(filters.tags);
  const source = sanitizeOpportunitySearchTerm(filters.source).toLowerCase();
  const valueMin = normalizeNumericFilter(filters.valueMin);
  const valueMax = normalizeNumericFilter(filters.valueMax);
  const dateFrom = isDateOnly(filters.dateFrom) ? filters.dateFrom : "";
  const dateTo = isDateOnly(filters.dateTo) ? `${filters.dateTo}T23:59:59.999` : "";
  const safeSortField = normalizeSortField(sortField);
  const safeSortDir = normalizeSortDir(sortDir);

  let result = opportunities;

  if (searchTokens.length > 0) {
    result = result.filter((opportunity) => {
      const contact = getNestedContact(opportunity);
      const haystack = [
        opportunity.name,
        opportunity.source,
        opportunity.company_name,
        contact.first_name,
        contact.last_name,
        contact.email,
        contact.phone,
        contact.company_name,
      ].map(getString).join(" ").toLowerCase();
      return searchTokens.every((token) => haystack.includes(token));
    });
  }

  if (statuses.length > 0) {
    result = result.filter((opportunity) => statuses.includes(getString(opportunity.status)));
  }
  if (filters.assignedTo) {
    result = result.filter((opportunity) => opportunity.assigned_to === filters.assignedTo);
  }
  if (filters.followerId) {
    result = result.filter((opportunity) => opportunity.follower_id === filters.followerId);
  }
  if (filters.callCenterId) {
    result = result.filter((opportunity) => opportunity.call_center_id === filters.callCenterId);
  }
  if (source) {
    result = result.filter((opportunity) => getString(opportunity.source).toLowerCase().includes(source));
  }
  if (valueMin !== null) {
    result = result.filter((opportunity) => Number(opportunity.value || 0) >= valueMin);
  }
  if (valueMax !== null) {
    result = result.filter((opportunity) => Number(opportunity.value || 0) <= valueMax);
  }
  if (dateFrom) {
    result = result.filter((opportunity) => getString(opportunity.created_at) >= dateFrom);
  }
  if (dateTo) {
    result = result.filter((opportunity) => getString(opportunity.created_at) <= dateTo);
  }
  if (tags.length > 0) {
    result = result.filter((opportunity) => {
      const opportunityTags = normalizeTags(opportunity.tags);
      return tags.some((tag) => opportunityTags.includes(tag));
    });
  }
  if (onlyMine && currentUserId) {
    // «Mie» = venditore, call center o follower, come sul database.
    result = result.filter((opportunity) =>
      opportunity.assigned_to === currentUserId
      || opportunity.call_center_id === currentUserId
      || opportunity.follower_id === currentUserId);
  }

  return [...result].sort((a, b) => {
    let cmp = 0;
    if (safeSortField === "name") {
      cmp = getString(a.name).localeCompare(getString(b.name), "it", { sensitivity: "base" });
    } else if (safeSortField === "value") {
      cmp = (Number(a.value) || 0) - (Number(b.value) || 0);
    } else if (safeSortField === "created_at") {
      cmp = getString(a.created_at).localeCompare(getString(b.created_at));
    } else if (safeSortField === "updated_at") {
      cmp = getString(a.updated_at).localeCompare(getString(b.updated_at));
    }
    return safeSortDir === "asc" ? cmp : -cmp;
  });
}
