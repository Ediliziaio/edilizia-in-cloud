import { describe, expect, it } from "vitest";
import {
  filterAndSortOpportunities,
  filtriPerServer,
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

  it("«I miei deal» vale anche per chi segue l'opportunità come call center o follower", () => {
    const opportunities = [
      { id: "venditore", assigned_to: "u1", created_at: "2026-05-03" },
      { id: "call-center", assigned_to: "u2", call_center_id: "u1", created_at: "2026-05-02" },
      { id: "follower", follower_id: "u1", created_at: "2026-05-01" },
      { id: "altro", assigned_to: "u2", created_at: "2026-05-04" },
    ];
    expect(
      filterAndSortOpportunities({ opportunities, onlyMine: true, currentUserId: "u1" }).map((o) => o.id),
    ).toEqual(["venditore", "call-center", "follower"]);
  });
});

describe("filtri per il database (opportunita_filtrate)", () => {
  it("senza filtri non manda niente: la chiave della cache resta la stessa", () => {
    expect(filtriPerServer({})).toEqual({});
    expect(filtriPerServer({
      searchQuery: "   ",
      filters: { statuses: [], assignedTo: "", source: "", valueMin: "", valueMax: "", dateFrom: "", dateTo: "", tags: [] },
      onlyMine: false,
    })).toEqual({});
  });

  it("traduce ogni filtro della pagina nel nome che usa il database", () => {
    expect(filtriPerServer({
      searchQuery: "  Rossi%, Monza ",
      filters: {
        statuses: ["won", "open"],
        assignedTo: "v1",
        followerId: "f1",
        callCenterId: "c1",
        source: " Facebook ",
        valueMin: "1000",
        valueMax: "abc",
        dateFrom: "2026-01-01",
        dateTo: "31/12/2026",
        tags: ["  Da Richiamare ", "urgente", "urgente"],
      },
      onlyMine: true,
      currentUserId: "u1",
      visibiliA: "u1",
      striscia: "stallo",
    })).toEqual({
      cerca: "rossi monza",
      stati: ["open", "won"],
      venditore: "v1",
      follower: "f1",
      call_center: "c1",
      fonte: "facebook",
      valore_min: "1000",
      dal: "2026-01-01",
      tag: ["da richiamare", "urgente"],
      miei: "u1",
      visibili_a: "u1",
      striscia: "stallo",
    });
  });

  it("«I miei deal» senza utente non filtra (non si vede una pagina vuota)", () => {
    expect(filtriPerServer({ onlyMine: true, currentUserId: null })).toEqual({});
  });
});
