import { describe, expect, it } from "vitest";
import {
  buildContactDateRange,
  normalizeContactsUrlState,
  sanitizeContactSearchTerm,
  toggleContactsPageSelection,
} from "@/lib/marketingContacts";

describe("marketing contacts helpers", () => {
  it("normalizes unsafe URL params before they reach Supabase queries", () => {
    expect(
      normalizeContactsUrlState({
        activeTab: "not-a-tab",
        page: Number.NaN,
        pageSize: 999,
        sortField: "drop_table",
        sortDirection: "sideways",
      }),
    ).toEqual({
      activeTab: "all",
      page: 1,
      pageSize: 25,
      sortField: "created_at",
      sortDirection: "desc",
    });
  });

  it("keeps valid URL params untouched", () => {
    expect(
      normalizeContactsUrlState({
        activeTab: "lists",
        page: 3,
        pageSize: 50,
        sortField: "email",
        sortDirection: "asc",
      }),
    ).toMatchObject({
      activeTab: "lists",
      page: 3,
      pageSize: 50,
      sortField: "email",
      sortDirection: "asc",
    });
  });

  it("treats the old Facebook leads tab as a regular contacts view", () => {
    expect(
      normalizeContactsUrlState({
        activeTab: "meta",
        page: 1,
        pageSize: 25,
        sortField: "created_at",
        sortDirection: "desc",
      }).activeTab,
    ).toBe("all");
  });

  it("sanitizes search text for PostgREST or() filters without erasing useful terms", () => {
    expect(sanitizeContactSearchTerm("  Mario%, Rossi(foo)  ")).toBe("Mario Rossi foo");
    expect(sanitizeContactSearchTerm(",,%%")).toBe("");
  });

  it("toggles only the visible contact page and preserves selections from other pages", () => {
    const selected = new Set(["off-page-1", "off-page-2"]);
    const visibleIds = ["visible-1", "visible-2"];

    expect([...toggleContactsPageSelection(selected, visibleIds)].sort()).toEqual([
      "off-page-1",
      "off-page-2",
      "visible-1",
      "visible-2",
    ]);

    expect([...toggleContactsPageSelection(new Set(["off-page-1", ...visibleIds]), visibleIds)]).toEqual([
      "off-page-1",
    ]);
  });

  it("builds an inclusive day range for timestamp date filters", () => {
    expect(buildContactDateRange("2026-05-23")).toEqual({
      start: "2026-05-23T00:00:00.000Z",
      endExclusive: "2026-05-24T00:00:00.000Z",
    });
    expect(buildContactDateRange("not-a-date")).toBeNull();
  });
});
