import { describe, it, expect } from "vitest";
import {
  windowSystem,
  monoblockSections,
  projectingGuideFields,
  WINDOW_SYSTEM_MEASURES,
} from "@/lib/surveys/windowSystems";
import {
  windowSurveyDrawing,
  windowComponentData,
  windowSurveyIssues,
  validateWindowSurvey,
  windowSurveyDraftValues,
  windowSurveySections,
} from "@/lib/surveys/windowSurvey";
import { applyCommonSurveyValues } from "@/lib/surveys/copyElement";
import { makeCompleteWindowSurvey } from "../fixtures/completeWindowSurvey";
import { isVisible } from "@/components/surveys/engine/evalConditions";
describe("Guide a sporgere e monoblocchi", () => {
  const d = makeCompleteWindowSurvey(),
    mono = d.elements[0],
    shutter = d.elements[7];
  const infisso = d.template.schema.element_types.find(
      (t) => t.key === "infisso",
    )!,
    tap = d.template.schema.element_types.find(
      (t) => t.key === "tapparella_standalone",
    )!;
  it("non interpreta vecchie note guide come un telaio a sporgere e non presume monoblocchi", () => {
    expect(
      windowSystem("tapparella_standalone", { rv_guide_profile: "sporgente" }),
    ).toBeNull();
    for (const presence of [undefined, "assente", "da_verificare"])
      expect(
        windowSystem("infisso", {
          ...mono.values,
          rv_monoblock_presence: presence,
        }),
      ).toBeNull();
  });
  it("mostra i dettagli soltanto dopo la scelta esplicita", () => {
    const sections = monoblockSections();
    expect(isVisible(sections[1].show_if, {})).toBe(false);
    expect(
      isVisible(sections[1].show_if, { rv_monoblock_presence: "nuovo" }),
    ).toBe(true);
    const dependent = projectingGuideFields().slice(1);
    expect(
      dependent.every(
        (f) => !isVisible(f.show_if, { rv_guide_kind: "incassate" }),
      ),
    ).toBe(true);
    expect(
      dependent.every((f) =>
        isVisible(f.show_if, { rv_guide_kind: "sporgere" }),
      ),
    ).toBe(true);
  });
  it("la guida aperta usa solo lunghezza mobile e proiezione rilevate, senza cambiare il telo", () => {
    const before = structuredClone(shutter.values),
      drawing = windowSurveyDrawing(tap, shutter.values)!;
    expect(drawing.scene.larghezza).toBe(1400);
    expect(drawing.scene.altezza).toBe(2400);
    expect(drawing.system!.figures).toHaveLength(2);
    expect(drawing.system!.figures[1].scene.quote[0].testo).toBe(
      "Sporgenza 500 mm",
    );
    const moving = drawing.system!.figures[1].scene.forme.find(
      (f) => f.ruolo === "simbolo",
    );
    expect(moving?.kind).toBe("poly");
    if (moving?.kind === "poly")
      expect(Math.hypot(...moving.punti[1])).toBeCloseTo(1300);
    expect(shutter.values).toEqual(before);
  });
  it.each([undefined, 0, -1, 1300, 1400, Infinity, NaN])(
    "non inventa l’apertura se la proiezione è %s",
    (p) => {
      const result = windowSystem("tapparella_standalone", {
        ...shutter.values,
        rv_project_open: p,
      })!;
      expect(
        result.figures.some((f) => f.title.includes("vista laterale")),
      ).toBe(false);
      expect(result.checks.some((c) => c.includes("Nessun angolo"))).toBe(true);
    },
  );
  it("segnala spazio insufficiente anche quando lo spazio libero è zero", () => {
    const result = windowSystem("tapparella_standalone", {
      ...shutter.values,
      rv_project_space: 0,
      rv_project_control: undefined,
    })!;
    expect(
      result.measurements.find((m) => m.key === "rv_project_space")!.value,
    ).toBe(0);
    expect(result.checks.join(" ")).toMatch(/supera lo spazio/);
    expect(result.checks.join(" ")).toMatch(/non viene dedotta dal motore/);
  });
  it("il monoblocco ha quote autonome e non sostituisce quelle del serramento", () => {
    const result = windowSurveyDrawing(infisso, mono.values)!;
    expect(result.scene.larghezza).toBe(1200);
    expect(result.system!.figures[0].scene.larghezza).toBe(1440);
    expect(result.system!.figures[1].scene.larghezza).toBe(1200);
    expect(result.system!.notes.join(" ")).toMatch(/non forniture aggiuntive/);
    expect(
      windowSystem("infisso", {
        ...mono.values,
        rv_monoblock_clear_width: 1500,
      })!.checks.join(" "),
    ).toMatch(/Luce interna/);
  });
  it("componenti integrati non vengono aggiunti automaticamente", () => {
    const v: Record<string, unknown> = { ...mono.values, complementi: [] };
    const before = structuredClone(v);
    expect(windowSystem("infisso", v)).not.toBeNull();
    expect(v).toEqual(before);
    expect(
      windowSystem("infisso", { ...v, rv_monoblock_parts: [] })!.checks.join(
        " ",
      ),
    ).toMatch(/componenti inclusi/);
  });
  it("guide a sporgere disponibili anche come complemento e incompatibilità da verificare", () => {
    const v = {
      ...mono.values,
      ...shutter.values,
      complementi: ["tapparella"],
      rv_monoblock_presence: "nuovo",
    };
    const projected = windowComponentData(infisso, v, "tapparella");
    expect(windowSystem(projected.type.key, projected.values)?.title).toMatch(
      /sporgere/,
    );
    expect(
      windowSurveyIssues(infisso, { ...v, rv_project_space: 100 }).join(" "),
    ).toMatch(/supera lo spazio/);
    expect(windowSurveyIssues(infisso, v).join(" ")).toMatch(
      /Monoblocco e telaio a sporgere/,
    );
  });
  it.each([-1, Infinity, NaN, "500", 100001])(
    "rifiuta quote non valide %s",
    (value) => {
      for (const key of WINDOW_SYSTEM_MEASURES)
        expect(() =>
          validateWindowSurvey(infisso, { ...mono.values, [key]: value }),
        ).toThrow(/guide a sporgere e monoblocco/);
    },
  );
  it("cambi ai sistemi revocano una verifica precedente", () => {
    for (const key of [
      "rv_guide_kind",
      "rv_project_open",
      "rv_monoblock_presence",
      "rv_monoblock_width",
    ]) {
      const prev = { ...mono.values, rv_order_checked: true };
      expect(
        windowSurveyDraftValues(prev, { ...prev, [key]: "changed" }, infisso)
          .rv_order_checked,
      ).toBe(false);
    }
  });
  it("copiare il prodotto non trasferisce sporgenza o presenza monoblocco al nuovo vano", () => {
    const next = applyCommonSurveyValues(tap, d.elements[6], shutter, true);
    expect(next.values.rv_project_open).toBe(500);
    expect(next.values.rv_guide_kind).toBe("sporgere");
    expect(next.values.larghezza).toBe(140);
    const other: typeof mono = {
      ...mono,
      values: {
        ...mono.values,
        rv_monoblock_presence: "assente",
        rv_monoblock_width: undefined,
      },
    };
    expect(
      applyCommonSurveyValues(infisso, mono, other, true).values
        .rv_monoblock_presence,
    ).toBe("assente");
  });
  it("non perde campi aziendali e non duplica le chiavi", () => {
    const keys = windowSurveySections(infisso).flatMap((s) =>
      s.fields.map((f) => f.key),
    );
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain("rv_monoblock_presence");
    expect(keys).toContain("rv_guide_kind");
  });
});
