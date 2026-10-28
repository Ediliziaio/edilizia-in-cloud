import { beforeEach, describe, expect, it, vi } from "vitest";
import { duplicateSurveyElement } from "@/lib/surveys/duplicateElement";
import { surveyDuplicatePayload } from "@/lib/surveys/copyElement";
import { makeWindowSurveyDetail } from "../fixtures/windowSurvey";
const m = vi.hoisted(() => ({
  from: vi.fn(),
  insert: vi.fn(),
  survey: null as unknown,
  source: null as unknown,
  area: null as unknown,
  existing: null as unknown,
  payload: null as unknown,
  error: false,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: m.from },
}));
const d = makeWindowSurveyDetail(),
  e = d.elements[0],
  req = {
    id: "20261027-1000-4000-a000-000000000001",
    sourceId: e.id,
    areaId: e.area_id,
    label: "Copia di prova",
    mode: "all" as const,
  };
beforeEach(() => {
  vi.clearAllMocks();
  m.survey = d.survey;
  m.source = e;
  m.area = d.areas[0];
  m.existing = null;
  m.error = false;
  m.payload = null;
  m.from.mockImplementation((table: string) => {
    let id = "";
    const q = {
      select: vi.fn(() => q),
      eq: vi.fn((key, value) => {
        if (key === "id") id = value;
        return q;
      }),
      insert: vi.fn((payload) => {
        m.insert(payload);
        m.payload = payload;
        return q;
      }),
      maybeSingle: vi.fn(async () => ({
        data:
          table === "surveys"
            ? m.survey
            : table === "survey_areas"
              ? m.area
              : id === req.id
                ? m.existing
                : m.source,
        error: null,
      })),
      single: vi.fn(async () => ({
        data: m.error ? null : { ...e, ...(m.payload as object) },
        error: m.error ? new Error("offline") : null,
      })),
    };
    return q;
  });
});
describe("Duplicazione autenticata, singola e ritentabile", () => {
  it("fa un solo inserimento scoped senza copiare il vecchio identificativo", async () => {
    const result = await duplicateSurveyElement(d, e, req, d.survey.company_id);
    expect(result.id).toBe(req.id);
    expect(m.insert).toHaveBeenCalledTimes(1);
    expect(m.insert.mock.calls[0][0].is_complete).toBe(false);
  });
  it("recupera la stessa copia dopo una risposta persa, senza secondo inserimento", async () => {
    m.existing = {
      ...e,
      ...surveyDuplicatePayload(d, e, req, d.survey.company_id),
    };
    expect(
      (await duplicateSurveyElement(d, e, req, d.survey.company_id)).id,
    ).toBe(req.id);
    expect(m.insert).not.toHaveBeenCalled();
  });
  it("non riusa silenziosamente una copia con dati diversi", async () => {
    m.existing = {
      ...e,
      ...surveyDuplicatePayload(d, e, req, d.survey.company_id),
      element_label: "Altra richiesta",
    };
    await expect(
      duplicateSurveyElement(d, e, req, d.survey.company_id),
    ).rejects.toThrow("dati diversi");
    expect(m.insert).not.toHaveBeenCalled();
  });
  it.each(["signed", "source", "area", "company"])(
    "blocca il caso %s",
    async (reason) => {
      if (reason === "signed") m.survey = { ...d.survey, status: "signed" };
      if (reason === "source") m.source = null;
      if (reason === "area") m.area = null;
      await expect(
        duplicateSurveyElement(
          d,
          e,
          req,
          reason === "company" ? "other" : d.survey.company_id,
        ),
      ).rejects.toThrow();
      expect(m.insert).not.toHaveBeenCalled();
    },
  );
  it("un errore non appare come duplicazione riuscita", async () => {
    m.error = true;
    await expect(
      duplicateSurveyElement(d, e, req, d.survey.company_id),
    ).rejects.toThrow("Copia non confermata");
  });
});
