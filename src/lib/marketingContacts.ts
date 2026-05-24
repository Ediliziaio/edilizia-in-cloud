export type ContactsTab = "all" | "lists" | "meta";
export type ContactsSortField = "first_name" | "phone" | "email" | "company_name" | "created_at" | "last_activity_at";
export type ContactsSortDirection = "asc" | "desc";

const VALID_TABS = new Set<ContactsTab>(["all", "lists", "meta"]);
const VALID_PAGE_SIZES = new Set([25, 50, 100]);
const VALID_SORT_FIELDS = new Set<ContactsSortField>([
  "first_name",
  "phone",
  "email",
  "company_name",
  "created_at",
  "last_activity_at",
]);
const VALID_SORT_DIRECTIONS = new Set<ContactsSortDirection>(["asc", "desc"]);

export interface ContactsUrlStateInput {
  activeTab: unknown;
  page: unknown;
  pageSize: unknown;
  sortField: unknown;
  sortDirection: unknown;
}

export interface ContactsUrlState {
  activeTab: ContactsTab;
  page: number;
  pageSize: number;
  sortField: ContactsSortField;
  sortDirection: ContactsSortDirection;
}

function toPositiveInteger(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.floor(parsed);
}

export function normalizeContactsUrlState(input: ContactsUrlStateInput): ContactsUrlState {
  const page = toPositiveInteger(input.page, 1);
  const requestedPageSize = toPositiveInteger(input.pageSize, 25);
  const activeTab = typeof input.activeTab === "string" && VALID_TABS.has(input.activeTab as ContactsTab)
    ? input.activeTab as ContactsTab
    : "all";
  const pageSize = VALID_PAGE_SIZES.has(requestedPageSize) ? requestedPageSize : 25;
  const sortField = typeof input.sortField === "string" && VALID_SORT_FIELDS.has(input.sortField as ContactsSortField)
    ? input.sortField as ContactsSortField
    : "created_at";
  const sortDirection = typeof input.sortDirection === "string" && VALID_SORT_DIRECTIONS.has(input.sortDirection as ContactsSortDirection)
    ? input.sortDirection as ContactsSortDirection
    : "desc";

  return {
    activeTab,
    page,
    pageSize,
    sortField,
    sortDirection,
  };
}

export function sanitizeContactSearchTerm(value: unknown): string {
  if (value == null) return "";
  return String(value)
    .replace(/[%(),]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function toggleContactsPageSelection(
  selectedIds: Set<string>,
  visibleContactIds: string[],
): Set<string> {
  const next = new Set(selectedIds);
  const visibleIds = visibleContactIds.filter(Boolean);
  if (visibleIds.length === 0) return next;

  const everyVisibleSelected = visibleIds.every((id) => next.has(id));
  visibleIds.forEach((id) => {
    if (everyVisibleSelected) next.delete(id);
    else next.add(id);
  });

  return next;
}

export function buildContactDateRange(value: unknown): { start: string; endExclusive: string } | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const start = new Date(Date.UTC(year, monthIndex, day));
  if (
    start.getUTCFullYear() !== year ||
    start.getUTCMonth() !== monthIndex ||
    start.getUTCDate() !== day
  ) {
    return null;
  }

  const end = new Date(start.getTime());
  end.setUTCDate(end.getUTCDate() + 1);

  return {
    start: start.toISOString(),
    endExclusive: end.toISOString(),
  };
}
