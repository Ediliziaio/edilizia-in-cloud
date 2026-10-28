import { describe, expect, it } from "vitest";
import { INTERNAL_DOOR_TYPE } from "@/lib/surveys/doorSurvey";
import {
  windowDisplayValues,
  windowSurveyDrawing,
  windowSurveyFinishLabel,
  windowSurveyDraftValues,
} from "@/lib/surveys/windowSurvey";
import { DOOR_MOVEMENT_EXAMPLES } from "../fixtures/doorMovements";

describe("Finiture del rilievo · bianco soltanto di rappresentazione", () => {
  const base = DOOR_MOVEMENT_EXAMPLES[0].values;
  it("disegna bianco senza scrivere una finitura nel rilievo", () => {
    const values = structuredClone(base);
    const drawing = windowSurveyDrawing(INTERNAL_DOOR_TYPE, values)!;
    expect(drawing.internal).toMatchObject({ hex: "#ffffff" });
    expect(drawing.external).toMatchObject({ hex: "#ffffff" });
    expect(windowSurveyFinishLabel(values, "esterna")).toContain(
      "colore da confermare",
    );
    expect(values).toEqual(base);
    expect(values.colore_esterno).toBeUndefined();
  });
  it("rispetta due colori diversi e il RAL caldo, senza trasformarlo in bianco puro", () => {
    const values = {
      ...base,
      colore_interno: "RAL 9010",
      colore_esterno: "#ffffff",
    };
    const drawing = windowSurveyDrawing(INTERNAL_DOOR_TYPE, values)!;
    expect(drawing.internal).not.toMatchObject({ hex: "#ffffff" });
    expect(drawing.external).toMatchObject({ hex: "#ffffff" });
    expect(windowSurveyFinishLabel(values, "interna")).toContain("RAL 9010");
    expect(windowSurveyFinishLabel(values, "esterna")).not.toContain(
      "da confermare",
    );
  });
  it("mantiene neutro un codice sconosciuto e lo segnala anche se nel colore generale", () => {
    const values = { ...base, colore: "Codice fornitore XYZ" };
    const drawing = windowSurveyDrawing(INTERNAL_DOOR_TYPE, values)!;
    expect(drawing.internal).toBeNull();
    expect(drawing.warnings.join(" ")).toContain("Colore non riconosciuto");
    expect(windowSurveyFinishLabel(values, "interna")).toContain("resa neutra");
  });
  it("ignora spazi vuoti, ma rispetta il colore ereditato; le porte non ereditano dalle finestre", () => {
    const values = { ...base, colore_interno: "  " };
    expect(
      windowSurveyDrawing(INTERNAL_DOOR_TYPE, values)!.internal,
    ).toMatchObject({ hex: "#ffffff" });
    const projected = windowDisplayValues(INTERNAL_DOOR_TYPE, base, {
      colore_interno_infissi: "RAL 7016",
    });
    expect(
      windowSurveyDrawing(INTERNAL_DOOR_TYPE, projected)!.internal,
    ).toMatchObject({ hex: "#ffffff" });
    const generic = { ...base, colore: "RAL 7016", colore_interno: "  " };
    expect(
      windowSurveyDrawing(INTERNAL_DOOR_TYPE, generic)!.internal,
    ).not.toMatchObject({ hex: "#ffffff" });
  });
  it("una scelta esplicita di colore revoca la precedente verifica d’ordine", () => {
    const values = { ...base, rv_order_checked: true };
    const updated = windowSurveyDraftValues(
      values,
      { ...values, colore_esterno: "#ffffff" },
      INTERNAL_DOOR_TYPE,
    );
    expect(updated.rv_order_checked).not.toBe(true);
  });
});
