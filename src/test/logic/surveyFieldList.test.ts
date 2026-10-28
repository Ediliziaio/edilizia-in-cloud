import { describe, expect, it } from "vitest";
import { fieldSurveyGroup, filterFieldSurveys } from "@/lib/surveys/fieldList";
import type { FieldSurveyListRow } from "@/hooks/useFieldSurveys";

const rows: FieldSurveyListRow[] = [
  {
    id: "a",
    code: "SOP-1",
    status: "in_progress",
    address: "Via Libertà",
    city: "Torino",
    scheduled_at: null,
    field_review_note: null,
    template: { name: "Climatizzazione", category: "climatizzazione" },
  },
  {
    id: "b",
    code: "SOP-2",
    status: "completed",
    address: null,
    city: null,
    scheduled_at: null,
    field_review_note: null,
  },
  {
    id: "c",
    code: "SOP-3",
    status: "reviewed",
    address: null,
    city: null,
    scheduled_at: null,
    field_review_note: null,
  },
];
describe("Lista sopralluoghi campo", () => {
  it("distingue lavoro sul posto, revisione dell’ufficio e conclusi", () => {
    expect(fieldSurveyGroup("draft")).toBe("todo");
    expect(filterFieldSurveys(rows, "todo", "").map((s) => s.id)).toEqual([
      "a",
    ]);
    expect(filterFieldSurveys(rows, "office", "").map((s) => s.id)).toEqual([
      "b",
    ]);
    expect(filterFieldSurveys(rows, "done", "").map((s) => s.id)).toEqual([
      "c",
    ]);
  });
  it("cerca tutti i termini senza dipendere da accenti o maiuscole", () => {
    expect(
      filterFieldSurveys(rows, "all", " LIBERTA clima ").map((s) => s.id),
    ).toEqual(["a"]);
    expect(filterFieldSurveys(rows, "all", "Torino inesistente")).toEqual([]);
    expect(filterFieldSurveys(rows, "office", "Torino")).toEqual([]);
  });
  it("gestisce campi assenti senza modificare i dati ricevuti", () => {
    const before = JSON.stringify(rows);
    expect(filterFieldSurveys(rows, "all", "  ")).toEqual(rows);
    expect(filterFieldSurveys(rows, "all", "sop-2").map((s) => s.id)).toEqual([
      "b",
    ]);
    expect(JSON.stringify(rows)).toBe(before);
  });
});
