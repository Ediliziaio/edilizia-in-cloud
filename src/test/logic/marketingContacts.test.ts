import { describe, expect, it } from "vitest";
import {
  regolaCompleta,
  regoleGruppiPerIlDatabase,
  normalizeContactsUrlState,
  soloRegoleComplete,
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

  // Il giorno lo calcola il database sull'ora italiana. Prima il browser
  // mandava l'intervallo in UTC, e «24 settembre» cominciava alle 02:00: chi
  // era entrato fra mezzanotte e le due finiva nel giorno prima.
  it("le date partono come data: il giorno intero lo calcola il database", () => {
    expect(regoleGruppiPerIlDatabase([{ rules: [{ field: "created_at", operator: "is", value: "2026-05-23" }] }])).toEqual([
      { regole: [{ campo: "created_at", operatore: "is", valore: "2026-05-23" }] },
    ]);
    expect(regoleGruppiPerIlDatabase([{ rules: [{ field: "last_activity_at", operator: "older_than_days", value: " 30 " }] }])).toEqual([
      { regole: [{ campo: "last_activity_at", operatore: "older_than_days", valore: "30" }] },
    ]);
  });

  it("scarta le regole senza valore, le date che non si capiscono e i giorni fuori misura", () => {
    expect(regoleGruppiPerIlDatabase([{ rules: [{ field: "city", operator: "contains", value: "   " }] }])).toBeNull();
    expect(regoleGruppiPerIlDatabase([{ rules: [{ field: "created_at", operator: "is", value: "il mese scorso" }] }])).toBeNull();
    expect(regoleGruppiPerIlDatabase([{ rules: [{ field: "created_at", operator: "before", value: "2026-02-30" }] }])).toBeNull();
    expect(regoleGruppiPerIlDatabase([{ rules: [{ field: "created_at", operator: "last_days", value: "0" }] }])).toBeNull();
    expect(regoleGruppiPerIlDatabase([{ rules: [{ field: "created_at", operator: "last_days", value: "7,5" }] }])).toBeNull();
  });

  // I valori viaggiano nel corpo della richiesta: virgole e parentesi, che
  // nei tag ci sono («Fiera (Milano)»), non vanno più tolte.
  it("manda il valore com'è, tolti solo gli spazi ai bordi", () => {
    expect(regoleGruppiPerIlDatabase([{ rules: [{ field: "tags", operator: "is", value: " Fiera (Milano), stand 4 " }] }])).toEqual([
      { regole: [{ campo: "tags", operatore: "is", valore: "Fiera (Milano), stand 4" }] },
    ]);
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

// «Applica» salva solo le condizioni che filtrano: prima una regola lasciata
// senza valore restava nei filtri e contava come «1 filtro» su un elenco che
// filtrato non era.
describe("regole complete", () => {
  it("un operatore che vuole un valore, senza valore, non è completo", () => {
    expect(regolaCompleta({ field: "city", operator: "contains", value: "" })).toBe(false);
    expect(regolaCompleta({ field: "city", operator: "is_empty", value: "" })).toBe(true);
    expect(regolaCompleta({ field: "created_at", operator: "after", value: "2026-09-24" })).toBe(true);
    expect(regolaCompleta({ field: "created_at", operator: "after", value: "24/09/2026" })).toBe(false);
    expect(regolaCompleta({ field: "last_activity_at", operator: "last_days", value: "3650" })).toBe(true);
    expect(regolaCompleta({ field: "last_activity_at", operator: "last_days", value: "3651" })).toBe(false);
    expect(regolaCompleta({ field: "cf_campo", operator: "is", value: "Sì" })).toBe(true);
  });

  it("toglie le regole incomplete e i riquadri rimasti vuoti", () => {
    const gruppi = [
      { id: "a", rules: [
        { id: "1", field: "city", operator: "contains", value: "Milano" },
        { id: "2", field: "tags", operator: "is", value: "" },
      ] },
      { id: "b", rules: [{ id: "3", field: "source", operator: "is", value: "" }] },
    ];
    expect(soloRegoleComplete(gruppi)).toEqual([
      { id: "a", rules: [{ id: "1", field: "city", operator: "contains", value: "Milano" }] },
    ]);
  });
});
