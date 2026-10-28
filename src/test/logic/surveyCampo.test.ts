import { describe, it, expect } from "vitest";
import { availableSurveyTypes } from "@/lib/surveys/availableTypes";
import { surveyCompletion } from "@/lib/surveys/completion";
import { linkPerCampo } from "@/lib/notifiche/linkCampo";
import { surveyOfficeReviewText } from "@/lib/surveys/report";
import { makeSurveyDetail, surveyMedia } from "../fixtures/surveyDetail";
import type { ElementTypeDefinition } from "@/types/surveys";
const types = (...keys: string[]) =>
  keys.map(
    (key) => ({ key, label: key, sections: [] }) as ElementTypeDefinition,
  );
describe("Contratto comune rilievo campo/ufficio", () => {
  it("riporta l’esito ufficio separato dalle note del tecnico nel report comune",()=>{
    const d=makeSurveyDetail();expect(surveyOfficeReviewText(d.survey)).toBeNull();
    d.survey.field_review_note="Foto e misure controllate";d.survey.status="reviewed";d.survey.reviewed_at="2026-10-28T09:00:00Z";
    expect(surveyOfficeReviewText(d.survey)).toContain("Revisionato dall’ufficio");expect(surveyOfficeReviewText(d.survey)).toContain("Foto e misure controllate");expect(d.survey.notes).not.toContain("Foto e misure controllate");
  });
  it("nel menu nasconde i doppioni ma conserva i soli tipi storici", () => {
    const source = types(
      "unita_interna",
      "split",
      "unita_esterna",
      "en_unita_esterna",
      "linea_frigo",
      "en_percorso_termico",
    );
    expect(availableSurveyTypes(source).map((t) => t.key)).toEqual([
      "split",
      "en_unita_esterna",
      "en_percorso_termico",
    ]);
    expect(source).toHaveLength(6);
    expect(availableSurveyTypes(types("unita_interna"))).toHaveLength(1);
  });
  it("un rilievo vuoto non può risultare completo", () => {
    const d = makeSurveyDetail();
    d.areas = [];
    d.elements = [];
    d.media = [];
    expect(surveyCompletion(d)).toBeLessThan(100);
  });
  it("include le foto obbligatorie della stanza nella completezza", () => {
    const d = makeSurveyDetail();
    d.media = [surveyMedia({ area_id: "area1", checklist_key: "panoramica" })];
    const full = surveyCompletion(d);
    d.media = [];
    expect(surveyCompletion(d)).toBeLessThan(full);
  });
  it("gli avvisi dell’ufficio aprono il percorso campo senza portare parametri di modifica", () => {
    const id = "00000000-0000-4000-a000-000000000001";
    expect(linkPerCampo(`/azienda/sopralluoghi/${id}?modifica=1`)).toBe(
      `/campo/sopralluoghi/${id}`,
    );
    expect(linkPerCampo("/azienda/sopralluoghi?stato=completed")).toBe(
      "/campo/sopralluoghi",
    );
  });
});
