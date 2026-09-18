import { describe, expect, it } from "vitest";
import {
  buildContactDateRange,
  regoleGruppiPerIlDatabase,
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

  it("normalizes the removed Facebook contacts tab to all contacts", () => {
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

// I filtri avanzati a gruppi non si risolvono più in un elenco di id dentro
// l'URL: il browser manda le regole e le valuta il database. Questa è la
// traduzione, l'unico pezzo che resta da questa parte.
describe("regoleGruppiPerIlDatabase", () => {
  it("manda campo, operatore e valore per ogni regola, gruppo per gruppo", () => {
    expect(
      regoleGruppiPerIlDatabase([
        { rules: [{ field: "city", operator: "is", value: "Milano" }] },
        { rules: [{ field: "tags", operator: "is", value: "fotovoltaico" }] },
      ]),
    ).toEqual([
      { regole: [{ campo: "city", operatore: "is", valore: "Milano" }] },
      { regole: [{ campo: "tags", operatore: "is", valore: "fotovoltaico" }] },
    ]);
  });

  it("le date diventano un intervallo: il giorno intero, non l'istante", () => {
    expect(regoleGruppiPerIlDatabase([{ rules: [{ field: "created_at", operator: "is", value: "2026-05-23" }] }])).toEqual([
      {
        regole: [{
          campo: "created_at",
          operatore: "is",
          valore: "2026-05-23",
          da: "2026-05-23T00:00:00.000Z",
          a: "2026-05-24T00:00:00.000Z",
        }],
      },
    ]);
  });

  it("scarta le regole senza valore e le date che non si capiscono", () => {
    expect(regoleGruppiPerIlDatabase([{ rules: [{ field: "city", operator: "is", value: "   " }] }])).toBeNull();
    expect(regoleGruppiPerIlDatabase([{ rules: [{ field: "created_at", operator: "is", value: "il mese scorso" }] }])).toBeNull();
  });

  it("tiene «vuoto» e «non vuoto», che un valore non ce l'hanno", () => {
    expect(regoleGruppiPerIlDatabase([{ rules: [{ field: "email", operator: "is_empty", value: "" }] }])).toEqual([
      { regole: [{ campo: "email", operatore: "is_empty", valore: "" }] },
    ]);
    expect(regoleGruppiPerIlDatabase([{ rules: [{ field: "last_activity_at", operator: "is_not_empty", value: "" }] }])).toEqual([
      { regole: [{ campo: "last_activity_at", operatore: "is_not_empty", valore: "" }] },
    ]);
  });

  it("niente gruppi usabili = nessun filtro, non un filtro vuoto", () => {
    expect(regoleGruppiPerIlDatabase([])).toBeNull();
    expect(regoleGruppiPerIlDatabase([{ rules: [] }])).toBeNull();
  });
});
