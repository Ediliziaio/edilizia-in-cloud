import { describe, expect, it } from "vitest";
import { surveyLastUpdated } from "@/lib/surveys/report";
import { makeSurveyDetail, surveyMedia } from "../fixtures/surveyDetail";

describe("Data dei dati salvati nel report", () => {
  it("considera modifiche a elementi, ambienti e nuovi allegati", () => {
    const detail = makeSurveyDetail();
    detail.elements[0].updated_at = "2026-10-25T10:00:00Z";
    expect(surveyLastUpdated(detail)).toBe("2026-10-25T10:00:00Z");
    detail.areas[0].updated_at = "2026-10-26T10:00:00Z";
    expect(surveyLastUpdated(detail)).toBe("2026-10-26T10:00:00Z");
    detail.media = [surveyMedia({ created_at: "2026-10-28T10:00:00Z" })];
    expect(surveyLastUpdated(detail)).toBe("2026-10-28T10:00:00Z");
  });
  it("ignora date non valide e mantiene l’aggiornamento della testata più recente", () => {
    const detail = makeSurveyDetail();
    detail.elements[0].updated_at = "invalid";
    detail.survey.updated_at = "2026-10-29T10:00:00Z";
    expect(surveyLastUpdated(detail)).toBe(detail.survey.updated_at);
  });
});
