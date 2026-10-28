import { describe, expect, it } from "vitest";
import { surveyAppointment, surveyCreationError } from "@/lib/surveys/creation";
describe("Creazione guidata sopralluogo", () => {
  it("consente una bozza autonoma senza CAP o appuntamento", () => {
    expect(surveyAppointment("", "09:00")).toBeNull();
    expect(surveyCreationError("", "", "")).toBeNull();
  });
  it("valida il CAP soltanto quando compilato", () => {
    expect(surveyCreationError("20100", "", "")).toBeNull();
    expect(surveyCreationError("20a00", "", "")).toMatch(/5 cifre/);
    expect(surveyCreationError("201", "", "")).toMatch(/5 cifre/);
  });
  it("salva l’istante con fuso orario esplicito conservando l’ora locale scelta", () => {
    expect(surveyAppointment("2026-10-30", "09:30")).toBe(
      new Date(2026, 9, 30, 9, 30).toISOString(),
    );
  });
  it.each([
    ["2026-02-30", "09:00"],
    ["2026-10-30", "25:00"],
    ["2026-10-30", ""],
    ["invalid", "09:30"],
  ])("rifiuta appuntamento impossibile %s %s", (d, t) => {
    expect(surveyCreationError("", d, t)).not.toBeNull();
  });
});
