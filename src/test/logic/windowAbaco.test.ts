import { describe, expect, it } from "vitest";
import { windowAbaco } from "@/lib/surveys/windowAbaco";
import {
  validateWindowSurvey,
  windowSurveyDrawing,
  windowSurveyDraftValues,
  windowSurveySections,
  windowSurveyIssues,
} from "@/lib/surveys/windowSurvey";
import { sectionsForSurveyStep } from "@/lib/surveys/elementWorkflow";
import { makeWindowSurveyDetail } from "../fixtures/windowSurvey";

const primary = { width: 1200, height: 1400, isRough: true };
const setup = () => {
  const detail = makeWindowSurveyDetail();
  return {
    type: detail.template.schema.element_types[0],
    values: detail.elements[0].values,
  };
};
describe("Abaco infissi · misure e geometria condivise", () => {
  it("converte le misure principali cm in mm, ma non inventa infisso o controtelaio", () => {
    const { type, values } = setup(),
      result = windowSurveyDrawing(type, values)!.abaco!;
    expect(result.measurements.map((m) => [m.width, m.height])).toEqual([
      [1200, 1400],
      [null, null],
      [null, null],
    ]);
    expect(result.notes.join(" ")).toMatch(/Controtelaio da rilevare/);
    expect(
      windowSurveyDrawing(type, { ...values, rv_measure_basis: "esistente" })!
        .abaco!.measurements[0].width,
    ).toBeNull();
    expect(
      windowSurveyDrawing(type, { ...values, rv_measure_basis: "da_definire" })!
        .abaco!.measurements[0].height,
    ).toBeNull();
  });
  it("quote autonome, senza sottrazioni e con avviso sulle incongruenze", () => {
    const data = windowAbaco(
      {
        rv_abaco_counterframe: "nuovo",
        rv_abaco_counter_width: 1250,
        rv_abaco_window_width: 1300,
        rv_abaco_rough_height: 1500,
      },
      [],
      primary,
    );
    expect(data.measurements.map((m) => m.width)).toEqual([1200, 1250, 1300]);
    expect(data.notes.join(" ")).toMatch(/Larghezze discordanti/);
    expect(data.notes.join(" ")).toMatch(/diverso dalle misure principali/);
    expect(data.measurements[2].height).toBeNull();
    const { type, values } = setup();
    expect(
      windowSurveyIssues(type, { ...values, rv_abaco_window_width: 1300 }).join(
        " ",
      ),
    ).toMatch(/Larghezze discordanti/);
  });
  it.each(["interno", "esterno"])(
    "arco di un quarto di giro, cerniere sx/dx e verso %s senza uscire dalla tavola",
    (swing) => {
      for (const lato of ["sx", "dx"] as const) {
        const p = windowAbaco(
          { rv_abaco_swing: swing },
          [{ tipo: "battente", lato }],
          primary,
        ).figures[0].scene;
        const arc = p.forme.find((f) => f.kind === "poly" && f.tratteggio);
        expect(arc?.kind).toBe("poly");
        if (arc?.kind !== "poly") throw new Error("Arco mancante");
        expect(arc.punti).toHaveLength(25);
        expect(arc.punti[0][1]).toBeCloseTo(p.altezza / 2);
        expect(arc.punti[0][0]).toBeCloseTo(lato === "sx" ? 840 : 160);
        expect(arc.punti.at(-1)![0]).toBeCloseTo(lato === "sx" ? 160 : 840);
        expect(arc.punti.at(-1)![1]).toBeCloseTo(
          p.altezza / 2 + (swing === "interno" ? 680 : -680),
        );
        for (const [x, y] of arc.punti) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(1000);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThanOrEqual(p.altezza);
        }
      }
    },
  );
  it("non sceglie un verso di apertura; fissi e aperture ignote non ricevono archi", () => {
    const result = windowAbaco(
      {},
      [{ tipo: "battente", lato: "sx" }, { tipo: "fisso" }],
      primary,
    );
    expect(
      result.figures[0].scene.forme.some((f) => f.ruolo === "simbolo"),
    ).toBe(false);
    expect(result.notes.join(" ")).toMatch(/nessun arco/);
  });
  it("vasistas e libro non diventano battenti, scorrevoli hanno solo frecce", () => {
    const result = windowAbaco(
      { rv_abaco_swing: "interno" },
      [
        { tipo: "vasistas" },
        { tipo: "libro", lato: "sx" },
        { tipo: "scorrevole", lato: "dx" },
      ],
      primary,
    );
    expect(
      result.figures[0].scene.forme.filter((f) => f.ruolo === "simbolo"),
    ).toHaveLength(1);
    expect(result.notes.join(" ")).toMatch(/cinematismo/);
  });
  it("le due viste frontali condividono la stessa pianta, senza specchiature ambigue", () => {
    const { type, values } = setup(),
      v = {
        ...values,
        rv_leaf_0_type: "battente",
        rv_leaf_0_side: "sx",
        rv_abaco_swing: "interno",
      };
    expect(windowSurveyDrawing(type, v, "interna")!.abaco).toEqual(
      windowSurveyDrawing(type, v, "esterna")!.abaco,
    );
  });
  it("campi nuovi separati fra Misure e Accessori, nessuna modifica allo schema aziendale", () => {
    const { type } = setup(),
      before = structuredClone(type),
      sections = windowSurveySections(type);
    expect(type).toEqual(before);
    expect(
      sectionsForSurveyStep(sections, 0).some(
        (s) => s.key === "rv_abaco_misure",
      ),
    ).toBe(true);
    expect(
      sectionsForSurveyStep(sections, 2).some((s) => s.key === "rv_abaco_posa"),
    ).toBe(true);
  });
  it.each([NaN, Infinity, -1, 0, "1234", 100001])(
    "rifiuta una quota tecnica non valida: %s",
    (value) => {
      const { type, values } = setup();
      expect(() =>
        validateWindowSurvey(type, { ...values, rv_abaco_window_width: value }),
      ).toThrow(/misure tecniche/);
    },
  );
  it("valida le scelte e revoca la precedente verifica d’ordine se cambia il controtelaio", () => {
    const { type, values } = setup();
    expect(() =>
      validateWindowSurvey(type, {
        ...values,
        rv_abaco_counterframe: "automatico",
      }),
    ).toThrow(/scelta/);
    const before = {
      ...values,
      rv_order_checked: true,
      rv_order_width: 1180,
      rv_order_height: 1380,
      rv_order_reference: "Tecnico",
    };
    expect(
      windowSurveyDraftValues(
        before,
        { ...before, rv_abaco_counter_width: 1190 },
        type,
      ).rv_order_checked,
    ).toBe(false);
    expect(
      windowSurveyDraftValues(before, { ...before, note: "Nota" }, type)
        .rv_order_checked,
    ).toBe(true);
    expect(
      windowSurveyDrawing(type, before, "interna", true)?.abaco,
    ).toBeUndefined();
  });
  it("non disegna un controtelaio dichiarato assente neanche con vecchie misure, ma segnala il conflitto", () => {
    const a = windowAbaco(
      { rv_abaco_counterframe: "assente", rv_abaco_counter_width: 1190 },
      [],
      primary,
    );
    const b = windowAbaco({ rv_abaco_counterframe: "nuovo" }, [], primary);
    expect(a.figures[1].scene.forme.length).toBe(
      b.figures[1].scene.forme.length - 2,
    );
    expect(a.notes.join(" ")).toMatch(/non previsto ma con misure/);
  });
  it("riusa lo spessore muro del modello con conversione cm/mm senza duplicare l’input", () => {
    const { type, values } = setup();
    expect(
      windowSurveySections(type)
        .flatMap((s) => s.fields)
        .some((f) => f.key === "rv_abaco_wall_depth"),
    ).toBe(false);
    const section = windowSurveyDrawing(type, { ...values, spessore_muro: 30 })!
      .abaco!.figures[1].scene;
    expect(section.quote.some((q) => q.testo === "Muro 300 mm")).toBe(true);
    expect(values.rv_abaco_wall_depth).toBeUndefined();
    const v = { ...values, spessore_muro: 30, rv_order_checked: true };
    expect(
      windowSurveyDraftValues(v, { ...v, spessore_muro: 35 }, type)
        .rv_order_checked,
    ).toBe(false);
  });
  it("non sostituisce una quota errata con quella del foro, né completa una Z parziale", () => {
    const a = windowAbaco(
      { rv_abaco_rough_width: -1, tipo_telaio: "z_35", lati_con_z: ["alto"] },
      [],
      primary,
    );
    const b = windowAbaco({ tipo_telaio: "l" }, [], primary);
    expect(a.measurements[0].width).toBeNull();
    expect(a.figures[1].scene.forme.length).toBe(
      b.figures[1].scene.forme.length + 1,
    );
  });
});
