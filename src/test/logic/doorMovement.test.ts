import { describe, expect, it } from "vitest";
import {
  doorMovementPlan,
  foldingDivisions,
  doorMovementSection,
} from "@/lib/surveys/doorMovement";
import { doorSurveyScene, INTERNAL_DOOR_TYPE } from "@/lib/surveys/doorSurvey";
import {
  validateWindowSurvey,
  windowSurveyDrawing,
  windowLeafSummary,
  windowSurveyDraftValues,
  windowSurveySections,
  windowSurveyReportSections,
} from "@/lib/surveys/windowSurvey";
import { sectionsForSurveyStep } from "@/lib/surveys/elementWorkflow";
import { isVisible } from "@/components/surveys/engine/evalConditions";
const base = {
  larghezza: 900,
  altezza: 2100,
  tipologia: "scorrevole_esterno",
  rv_door_layout: "singola",
  rv_door_slide_side: "sx",
  rv_door_slide_face: "a",
  rv_door_side_a: "Corridoio",
  rv_door_side_b: "Camera",
  rv_door_counterframe: "non_previsto",
};
describe("Porte scorrevoli e a libro · disegni da dati confermati", () => {
  it.each(["sx", "dx"])(
    "scorrimento esterno %s: anta aperta sul lato registrato, nessun arco",
    (side) => {
      const p = doorMovementPlan(900, {
        ...base,
        rv_door_slide_side: side,
      }).plan!;
      const open = p.forme.find(
        (f) => f.kind === "poly" && f.tratteggio && f.ruolo === "simbolo",
      );
      expect(open?.kind).toBe("poly");
      if (open?.kind !== "poly") throw new Error("Anta aperta mancante");
      expect(open.punti[0][0]).toBeCloseTo(side === "sx" ? 180 : 1980);
      expect(
        p.forme.some((f) => f.kind === "poly" && f.punti.length === 25),
      ).toBe(false);
    },
  );
  it("esterno muro: non sceglie una faccia della parete e non confonde A con B", () => {
    expect(
      doorMovementPlan(900, { ...base, rv_door_slide_face: null }).plan,
    ).toBeNull();
    const a = doorMovementPlan(900, base).plan!,
      b = doorMovementPlan(900, { ...base, rv_door_slide_face: "b" }).plan!;
    const pa = a.forme.find((f) => f.kind === "rect" && f.ruolo === "pannello"),
      pb = b.forme.find((f) => f.kind === "rect" && f.ruolo === "pannello");
    if (pa?.kind !== "rect" || pb?.kind !== "rect")
      throw new Error("Pannelli mancanti");
    expect(pa.y).toBeGreaterThan(pb.y);
  });
  it("scomparsa doppia: due tasche, frecce contrapposte e nessuna cerniera richiesta", () => {
    const v: Record<string, unknown> = {
      ...base,
      tipologia: "scorrevole_scomparsa",
      rv_door_layout: "doppia_simmetrica",
      rv_door_slide_side: null,
    };
    const d = doorSurveyScene(1600, 2100, v, true, true);
    expect(d.plan!.forme.filter((f) => f.ruolo === "ispezione")).toHaveLength(
      2,
    );
    expect(d.warnings.join(" ")).not.toMatch(
      /indica l’anta principale|Seconda anta:|Cerniere e spingere/,
    );
    expect(d.planLabels).toEqual({ top: "LATO B", bottom: "LATO A" });
    expect(d.scene.forme.filter((f) => f.ruolo === "simbolo")).toHaveLength(4);
  });
  it("doppia asimmetrica non quotata: niente divisione o movimento inventato", () => {
    const d = doorSurveyScene(
      1600,
      2100,
      { ...base, rv_door_layout: "doppia_asimmetrica" },
      true,
      true,
    );
    expect(d.plan).toBeNull();
    expect(d.scene.forme.filter((f) => f.ruolo === "simbolo")).toHaveLength(0);
  });
  it.each(["sx", "dx"])(
    "libro asimmetrico %s: divisorio misurato dal bordo di raccolta",
    (side) => {
      const v = {
        ...base,
        tipologia: "a_libro",
        rv_door_slide_side: side,
        rv_door_fold_layout: "asimmetrica",
        rv_door_fold_split_mm: 300,
        rv_door_fold_toward: "b",
      };
      expect(foldingDivisions(900, v)![0]).toBeCloseTo(
        side === "sx" ? 1 / 3 : 2 / 3,
      );
      const p = doorMovementPlan(900, v).plan!,
        fold = p.forme.find(
          (f) =>
            f.kind === "poly" && f.ruolo === "simbolo" && f.punti.length === 3,
        );
      if (fold?.kind !== "poly") throw new Error("Pacchetto mancante");
      const [start, joint, end] = fold.punti;
      expect(Math.hypot(joint[0] - start[0], joint[1] - start[1])).toBeCloseTo(
        300,
      );
      expect(Math.hypot(end[0] - joint[0], end[1] - joint[1])).toBeCloseTo(600);
      expect(end[1]).toBeCloseTo(start[1]);
      expect(joint[1]).toBeLessThan(start[1]);
    },
  );
  it.each(["a", "b"])(
    "libro simmetrico: ripiegamento esplicito verso %s",
    (toward) => {
      const p = doorMovementPlan(800, {
        ...base,
        tipologia: "a_libro",
        rv_door_fold_layout: "simmetrica",
        rv_door_fold_toward: toward,
      }).plan!;
      const fold = p.forme.find(
        (f) =>
          f.kind === "poly" && f.ruolo === "simbolo" && f.punti.length === 3,
      );
      if (fold?.kind !== "poly") throw new Error("Pacchetto mancante");
      expect(Math.sign(fold.punti[1][1] - fold.punti[0][1])).toBe(
        toward === "a" ? 1 : -1,
      );
      expect(
        p.forme.some((f) => f.kind === "poly" && f.punti.length === 25),
      ).toBe(false);
    },
  );
  it.each([undefined, 0, -1, 900, 1000, NaN])(
    "libro asimmetrico con quota %s: nessuna divisione ricostruita",
    (split) => {
      const v = {
        ...base,
        tipologia: "a_libro",
        rv_door_fold_layout: "asimmetrica",
        rv_door_fold_split_mm: split,
        rv_door_fold_toward: "a",
      };
      expect(foldingDivisions(900, v)).toBeNull();
      expect(doorMovementPlan(900, v).plan).toBeNull();
    },
  );
  it("soffietto: non imposta otto pannelli né ricostruisce la cinematica del produttore", () => {
    expect(foldingDivisions(900, { tipologia: "a_soffietto" })).toBeNull();
    const v = {
      ...base,
      tipologia: "a_soffietto",
      rv_door_fold_panels: 6,
      rv_door_fold_toward: "a",
    };
    expect(foldingDivisions(900, v)).toHaveLength(5);
    const m = doorMovementPlan(900, v);
    expect(m.plan).toBeNull();
    expect(m.warnings.join(" ")).toMatch(/produttore/);
  });
  it("niente spingere/tirare o cerniere obsolete nei riepiloghi delle porte scorrevoli", () => {
    expect(
      windowLeafSummary(
        { ...base, rv_door_hinge: "dx", rv_door_swing: "tirare" },
        "porta_interna",
      ),
    ).toMatch(/Scorrevole esterno muro.*raccolta SX/);
    const sections = windowSurveySections(INTERNAL_DOOR_TYPE);
    const active = sections
      .flatMap((s) => s.fields)
      .find((f) => f.key === "rv_door_active_side")!;
    expect(
      isVisible(active.show_if, {
        ...base,
        rv_door_layout: "doppia_simmetrica",
      }),
    ).toBe(false);
    const collection = sections
      .flatMap((s) => s.fields)
      .find((f) => f.key === "rv_door_slide_side")!;
    expect(
      isVisible(collection.show_if, {
        ...base,
        rv_door_layout: "doppia_simmetrica",
      }),
    ).toBe(false);
    expect(
      sectionsForSurveyStep(sections, 1).some(
        (s) => s.key === "rv_door_movement",
      ),
    ).toBe(true);
  });
  it("stessa pianta nei lati A/B; dettagli nuovi presenti nel report senza modificare il template", () => {
    const before = structuredClone(INTERNAL_DOOR_TYPE),
      a = windowSurveyDrawing(INTERNAL_DOOR_TYPE, base, "esterna")!,
      b = windowSurveyDrawing(INTERNAL_DOOR_TYPE, base, "interna")!;
    expect(a.detail).toEqual(b.detail);
    expect(a.detail!.caption).toMatch(/LATO B in alto · LATO A in basso/);
    const report = windowSurveyReportSections(
      INTERNAL_DOOR_TYPE,
      { ...base, rv_door_track_length: 1900 },
      1,
    )!;
    expect(
      report.sections
        .flatMap((s) => s.fields)
        .some((f) => f.key === "rv_door_track_length"),
    ).toBe(true);
    expect(INTERNAL_DOOR_TYPE).toEqual(before);
    expect(
      isVisible(doorMovementSection().show_if, { tipologia: "a_libro" }),
    ).toBe(true);
  });
  it.each([0, -1, NaN, Infinity, "300", 100001])(
    "quote di movimento non valide %s rifiutate",
    (n) => {
      expect(() =>
        validateWindowSurvey(INTERNAL_DOOR_TYPE, {
          ...base,
          rv_door_fold_split_mm: n,
        }),
      ).toThrow(/scorrimento/);
    },
  );
  it.each([1, 2.5, 21, "6"])(
    "numero di pannelli %s non valido rifiutato",
    (n) => {
      expect(() =>
        validateWindowSurvey(INTERNAL_DOOR_TYPE, {
          ...base,
          rv_door_fold_panels: n,
        }),
      ).toThrow(/numero di pannelli/);
    },
  );
  it("una nuova raccolta o suddivisione revoca le misure d’ordine verificate", () => {
    const v = {
      ...base,
      rv_order_checked: true,
      rv_order_width: 800,
      rv_order_height: 2100,
      rv_order_reference: "Tecnico",
    };
    expect(
      windowSurveyDraftValues(
        v,
        { ...v, rv_door_fold_split_mm: 300 },
        INTERNAL_DOOR_TYPE,
      ).rv_order_checked,
    ).toBe(false);
  });
});
