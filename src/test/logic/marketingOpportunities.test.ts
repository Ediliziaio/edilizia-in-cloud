import { describe, expect, it } from "vitest";
import {
  filterAndSortOpportunities,
  normalizeOpportunityUrlState,
  resolveOpportunityPipelineId,
  sanitizeOpportunitySearchTerm,
} from "@/lib/marketingOpportunities";

describe("marketing opportunities helpers", () => {
  it("falls back from a stale URL pipeline to the first available pipeline", () => {
    const pipelines = [
      { id: "pipeline-a", name: "Pipeline A" },
      { id: "pipeline-b", name: "Pipeline B" },
    ];

    expect(resolveOpportunityPipelineId("old-pipeline", pipelines)).toBe("pipeline-a");
    expect(resolveOpportunityPipelineId("pipeline-b", pipelines)).toBe("pipeline-b");
    expect(resolveOpportunityPipelineId("", pipelines)).toBe("pipeline-a");
    expect(resolveOpportunityPipelineId("old-pipeline", [])).toBeNull();
  });

  it("normalizes unsafe URL params before they drive the page state", () => {
    expect(
      normalizeOpportunityUrlState({
        viewMode: "cards",
        sortField: "drop_table",
        sortDir: "sideways",
        searchInput: "  Rossi%, cantiere(foo)  ",
      }),
    ).toEqual({
      viewMode: "kanban",
      sortField: "created_at",
      sortDir: "desc",
      searchInput: "Rossi cantiere foo",
    });
  });

  it("keeps valid URL params untouched", () => {
    expect(
      normalizeOpportunityUrlState({
        viewMode: "list",
        sortField: "value",
        sortDir: "asc",
        searchInput: "Monza",
      }),
    ).toEqual({
      viewMode: "list",
      sortField: "value",
      sortDir: "asc",
      searchInput: "Monza",
    });
  });

  it("sanitizes search text without erasing useful lead data", () => {
    expect(sanitizeOpportunitySearchTerm("  Mario%, Rossi(foo)  ")).toBe("Mario Rossi foo");
    expect(sanitizeOpportunitySearchTerm(",,%%")).toBe("");
  });

  it("ignores invalid numeric filters instead of hiding every opportunity", () => {
    const opportunities = [
      { id: "1", name: "Serramenti Rossi", value: 5000, status: "open", created_at: "2026-05-20", updated_at: "2026-05-21" },
      { id: "2", name: "Fotovoltaico Bianchi", value: 12000, status: "open", created_at: "2026-05-22", updated_at: "2026-05-22" },
    ];

    expect(
      filterAndSortOpportunities({
        opportunities,
        filters: { valueMin: "abc", valueMax: "xyz" },
      }).map((opportunity) => opportunity.id),
    ).toEqual(["2", "1"]);
  });

  it("filters, searches and sorts opportunities deterministically", () => {
    const opportunities = [
      {
        id: "1",
        name: "Preventivo serramenti",
        value: 5000,
        status: "open",
        created_at: "2026-05-20",
        updated_at: "2026-05-21",
        marketing_contacts: { first_name: "Mario", last_name: "Rossi", email: "mario@example.com", phone: "333" },
      },
      {
        id: "2",
        name: "Impianto fotovoltaico",
        value: 12000,
        status: "won",
        created_at: "2026-05-22",
        updated_at: "2026-05-22",
        marketing_contacts: { first_name: "Giulia", last_name: "Bianchi", email: "giulia@example.com", phone: "444" },
      },
      {
        id: "3",
        name: "Bagno",
        value: 3000,
        status: "open",
        created_at: "2026-05-18",
        updated_at: "2026-05-18",
        marketing_contacts: { first_name: "Marta", last_name: "Verdi", email: "marta@example.com", phone: "555" },
      },
    ];

    expect(
      filterAndSortOpportunities({
        opportunities,
        searchQuery: "preventivo rossi",
        filters: { valueMin: "1000", valueMax: "6000", statuses: ["open"] },
        sortField: "value",
        sortDir: "asc",
      }).map((opportunity) => opportunity.id),
    ).toEqual(["1"]);
  });
});
