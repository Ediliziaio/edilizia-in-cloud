import { beforeEach, describe, expect, it } from "vitest";
import { makeSurveyDetail } from "../fixtures/surveyDetail";
import {
  readSurveyDraft,
  writeSurveyDraft,
  removeSurveyDraft,
  reconcileSurveyDraft,
  surveyDraftKey,
  surveySchemaKey,
  SURVEY_DRAFT_TTL,
  type LocalSurveyDraft,
} from "@/lib/surveys/elementDraft";
import type { SurveyElementDraft } from "@/lib/surveys/workspace";
const scope = {
  userId: "user1",
  companyId: "company1",
  surveyId: "survey1",
  elementId: "element1",
};
const key = surveyDraftKey(scope);
const base = (): SurveyElementDraft => ({
  values: { width: 120, height: 140, zero: 0, flag: false },
  quantity: 1,
  notes: null,
  element_label: null,
});
const entry = (): LocalSurveyDraft => ({
  version: 1,
  revision: "rev1",
  savedAt: Date.now(),
  baseUpdatedAt: "v1",
  schema: surveySchemaKey(makeSurveyDetail().template.schema),
  base: base(),
  draft: { ...base(), values: { ...base().values, width: 125 } },
  annotation: null,
});
beforeEach(() => localStorage.clear());
describe("Bozze locali rilievo · isolamento, durata e conflitti", () => {
  it("una versione nuova o una copia corrotta non viene distrutta né sovrascritta", () => {
    for (const raw of [
      '{"version":2,"data":"da conservare"}',
      "{copia incompleta",
    ]) {
      localStorage.setItem(key, raw);
      expect(readSurveyDraft(localStorage, key)).toBeNull();
      expect(() => writeSurveyDraft(localStorage, key, entry(), null)).toThrow(
        "incompatibile",
      );
      expect(removeSurveyDraft(localStorage, key, null)).toBe(false);
      expect(localStorage.getItem(key)).toBe(raw);
    }
  });
  it.each(["userId", "companyId", "surveyId", "elementId"] as const)(
    "isola per %s",
    (field) => {
      writeSurveyDraft(localStorage, key, entry(), null);
      expect(
        readSurveyDraft(
          localStorage,
          surveyDraftKey({ ...scope, [field]: "other" }),
        ),
      ).toBeNull();
      expect(readSurveyDraft(localStorage, key)?.draft.values.width).toBe(125);
    },
  );
  it("scade dopo sette giorni senza toccare le altre bozze", () => {
    const d = entry();
    writeSurveyDraft(localStorage, key, d, null);
    localStorage.setItem("other-user", "keep");
    expect(
      readSurveyDraft(localStorage, key, d.savedAt + SURVEY_DRAFT_TTL + 1),
    ).toBeNull();
    expect(localStorage.getItem("other-user")).toBe("keep");
  });
  it.each([
    "{",
    JSON.stringify({ ...entry(), version: 99 }),
    JSON.stringify({ ...entry(), annotation: { note: "missing coordinates" } }),
  ])("ignora una copia corrotta/incompatibile", (raw) => {
    localStorage.setItem(key, raw);
    expect(readSurveyDraft(localStorage, key)).toBeNull();
  });
  it("non converte NaN in null nel deposito e non perde la copia valida", () => {
    const d = entry();
    writeSurveyDraft(localStorage, key, d, null);
    expect(() =>
      writeSurveyDraft(
        localStorage,
        key,
        { ...d, draft: { ...d.draft, values: { width: NaN } } },
        d.revision,
      ),
    ).toThrow();
    expect(readSurveyDraft(localStorage, key)?.draft.values.width).toBe(125);
  });
  it("una seconda scheda non sovrascrive né elimina una revisione cambiata", () => {
    const d = entry();
    writeSurveyDraft(localStorage, key, d, null);
    writeSurveyDraft(localStorage, key, { ...d, revision: "rev2" }, "rev1");
    expect(() =>
      writeSurveyDraft(localStorage, key, { ...d, revision: "rev3" }, "rev1"),
    ).toThrow("altra scheda");
    expect(removeSurveyDraft(localStorage, key, "rev1")).toBe(false);
    expect(readSurveyDraft(localStorage, key)?.revision).toBe("rev2");
  });
  it("mantiene modifiche remote su campi diversi senza ripristinare tutto il record vecchio", () => {
    const remote = { ...base(), values: { ...base().values, height: 150 } },
      local = { ...base(), values: { ...base().values, width: 125 } };
    const result = reconcileSurveyDraft(base(), remote, local);
    expect(result.unresolved).toEqual([]);
    expect(result.draft.values).toMatchObject({
      width: 125,
      height: 150,
      zero: 0,
      flag: false,
    });
  });
  it("lo stesso campo cambiato richiede una scelta esplicita", () => {
    const remote = { ...base(), quantity: 2, values: { width: 130 } },
      local = { ...base(), quantity: 3, values: { width: 125 } };
    expect(
      reconcileSurveyDraft(base(), remote, local).unresolved.map((c) => c.key),
    ).toEqual(["values.width", "quantity"]);
    const result = reconcileSurveyDraft(base(), remote, local, {
      "values.width": "local",
      quantity: "remote",
    });
    expect(result.unresolved).toEqual([]);
    expect(result.draft.quantity).toBe(2);
    expect(result.draft.values.width).toBe(125);
  });
  it("distingue una rimozione esplicita da un campo mai modificato", () => {
    const local = { ...base(), values: { height: 140, zero: 0, flag: false } };
    expect(
      reconcileSurveyDraft(base(), base(), local).draft.values,
    ).not.toHaveProperty("width");
  });
  it("rifiuta chiavi pericolose nel JSON del deposito", () => {
    const d = entry();
    d.draft.values = JSON.parse('{"__proto__":{"bad":true}}');
    expect(() => writeSurveyDraft(localStorage, key, d, null)).toThrow();
    expect(localStorage.getItem(key)).toBeNull();
  });
  it("conserva anche testo e coordinate di una nota non ancora aggiunta al rilievo", () => {
    const d = {
      ...entry(),
      annotation: {
        view: "esterna" as const,
        component: "cassonetto" as const,
        pending: { x: 0.2, y: 0.7 },
        note: "Verificare il cielino",
        photoId: "none",
      },
    };
    writeSurveyDraft(localStorage, key, d, null);
    expect(readSurveyDraft(localStorage, key)?.annotation).toEqual(
      d.annotation,
    );
  });
});
