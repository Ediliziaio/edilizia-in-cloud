import { describe, it, expect } from "vitest";
import { makeWindowSurveyDetail } from "../fixtures/windowSurvey";
import {
  dimensionMm,
  leafCount,
  readWindowPins,
  trimMetres,
  validateWindowSurvey,
  windowComponentData,
  windowDisplayValues,
  windowOrderVerified,
  windowSurveyDraftValues,
  windowSurveyDrawing,
  windowSurveyIssues,
  windowSurveySections,
  WINDOW_PINS,
} from "@/lib/surveys/windowSurvey";
import { buildSurveyReport } from "@/lib/surveys/report";
import {
  doorPlan,
  boxScenes,
  mosquitoScene,
} from "@/lib/surveys/windowComponentScenes";
import { surveyElementPatch } from "@/lib/surveys/workspace";
import { boxAxonometric } from "@/lib/surveys/boxAxonometric";
const setup = () => {
  const detail = makeWindowSurveyDetail();
  return {
    detail,
    type: detail.template.schema.element_types[0],
    values: detail.elements[0].values,
  };
};
describe("Rilievo visuale · adattatore condiviso serramenti", () => {
  it("un portoncino nuovo completa l’apertura con cerniere e spingere/tirare, senza il vecchio campo nascosto", () => {
    const detail = makeWindowSurveyDetail(),
      type = detail.template.schema.element_types.find(
        (t) => t.key === "portoncino_blindato",
      )!;
    detail.elements[0].element_type = type.key;
    const e = detail.elements[0],
      values = {
        larghezza: 90,
        altezza: 210,
        tipologia: "1_anta",
        rv_door_hinge: "sx",
        rv_door_swing: "spingere",
      };
    const patch = surveyElementPatch(detail, e, {
      values,
      quantity: 1,
      notes: null,
      element_label: null,
    });
    expect(patch.missing_required_fields).not.toContain("apertura");
    const report = buildSurveyReport({
      ...detail,
      elements: [{ ...e, ...patch }],
    });
    const opening = report.areas
      .flatMap((a) => a.elements)
      .concat(report.unassigned)
      .flatMap((el) => el.sections.flatMap((s) => s.fields))
      .find((f) => f.key === "apertura");
    expect(opening?.missing).toBe(false);
    expect(opening?.value).toContain("A spingere");
  });
  it("assonometria cassonetto: L/H/P e C indipendente, nessuna misura copiata dal riferimento", () => {
    const sketch = boxAxonometric(1300, 250, 220, 300, 1350, "frontale")!;
    expect(sketch.dimensions.map((d) => d.text)).toEqual([
      "L 1300 mm",
      "H 250 mm",
      "P 220 mm",
      "C 300 mm",
    ]);
    expect(sketch.faces.map((f) => f.key)).toEqual([
      "lid",
      "side",
      "top",
      "front",
    ]);
    expect(sketch.viewBox.every(Number.isFinite)).toBe(true);
    expect(sketch.viewBox[2]).toBeGreaterThan(0);
    expect(sketch.viewBox[3]).toBeGreaterThan(0);
  });
  it.each([null, 0, -1, NaN])(
    "senza P valida (%s) non inventa la profondità per il 3D",
    (depth) => {
      expect(
        boxAxonometric(1300, 250, depth, 300, null, "inferiore"),
      ).toBeNull();
    },
  );
  it("C mancante non diventa uguale a P, né si disegna un cielino fittizio", () => {
    const sketch = boxAxonometric(1300, 250, 220, null, null, "")!;
    expect(sketch.dimensions).toHaveLength(3);
    expect(sketch.faces.some((f) => f.key === "lid")).toBe(false);
    expect(sketch.notes.join(" ")).toMatch(/Cielino C da rilevare/);
  });
  it("schema orizzontale distinto dalle proporzioni: quote originali e anomalia preservate", () => {
    const sketch = boxAxonometric(1200, 2700, 220, null, null, "")!;
    const reference = sketch.reference!;
    expect(reference.illustrative).toBe(true);
    expect(reference.dimensions.map((d) => d.text)).toEqual([
      "L 1200 mm",
      "H 2700 mm",
      "P 220 mm",
      "C da rilevare",
    ]);
    expect(sketch.dimensions).toHaveLength(3);
    expect(reference.viewBox[2] / reference.viewBox[3]).toBeGreaterThan(1.4);
    expect(sketch.viewBox[3]).toBeGreaterThan(sketch.viewBox[2]);
    expect(reference.notes.join(" ")).toMatch(/non in scala/);
    expect(reference.warnings[0]).toMatch(/H 2700 mm.*L 1200 mm/);
    expect(reference.reference).toBeUndefined();
  });
  it("lo schema non calcola C da P e mantiene quote decimali e cielino misurato", () => {
    const sketch = boxAxonometric(1300.5, 250, 220, 300, 1350, "frontale")!;
    expect(sketch.reference!.dimensions.map((d) => d.text)).toEqual(
      sketch.dimensions.map((d) => d.text),
    );
    expect(sketch.warnings).toEqual([]);
  });
  it("il complemento cassonetto usa le sue quote e lo stesso modello 3D del dedicato", () => {
    const { type, values } = setup();
    const component = windowComponentData(
      type,
      {
        ...values,
        complementi: ["cassonetto"],
        cas_larghezza: 130,
        cas_altezza: 25,
        cas_profondita: 22,
        rv_cielino_depth: 300,
      },
      "cassonetto",
    );
    const drawing = windowSurveyDrawing(component.type, component.values)!;
    expect(drawing.axonometric!.dimensions.map((d) => d.text)).toEqual([
      "L 1300 mm",
      "H 250 mm",
      "P 220 mm",
      "C 300 mm",
    ]);
  });
  it("modificare profondità o cielino invalida la verifica d’ordine precedente", () => {
    const checked = {
      rv_order_checked: true,
      rv_order_width: 1300,
      rv_order_height: 250,
      rv_order_reference: "TECNICO TEST",
      profondita: 22,
      rv_cielino_depth: 300,
    };
    expect(
      windowSurveyDraftValues(checked, { ...checked, rv_cielino_depth: 320 })
        .rv_order_checked,
    ).toBe(false);
    expect(
      windowSurveyDraftValues(checked, { ...checked, profondita: 24 })
        .rv_order_checked,
    ).toBe(false);
  });
  it.each([
    ["sx", "spingere"],
    ["dx", "spingere"],
    ["sx", "tirare"],
    ["dx", "tirare"],
  ])("portoncino %s %s: verso esplicito e arco di 90 gradi", (hinge, swing) => {
    const plan = doorPlan(900, hinge, swing)!;
    const arc = plan.forme[plan.forme.length - 1];
    expect(arc.kind).toBe("poly");
    if (arc.kind !== "poly") return;
    expect(
      arc.punti.every(([, y]) =>
        swing === "spingere"
          ? y >= arc.punti[0][1] - 0.001
          : y <= arc.punti[0][1] + 0.001,
      ),
    ).toBe(true);
    expect(doorPlan(900, hinge, "")).toBeNull();
  });
  it("il cassonetto ha una sezione H/P solo quando la profondità è misurata", () => {
    expect(
      boxScenes(1300, 250, null, "frontale", null, null, null).section,
    ).toBeNull();
    const box = boxScenes(1300, 250, 220, "inferiore", 60, 200, 15);
    expect(box.section!.quote.map((q) => q.testo)).toContain("P 220 mm");
    expect(box.section!.quote.map((q) => q.testo)).toContain("Cielino 200 mm");
    expect(box.section!.quote.map((q) => q.testo)).toContain("Ø 60 mm");
  });
  it("la zanzariera ha una rete e la guida a terra non è imposta ai modelli senza barriera", () => {
    const fixed = mosquitoScene(
      1000,
      1400,
      "fissa",
      25,
      "nessuno",
      "si",
      false,
    );
    const lateral = mosquitoScene(
      1000,
      1400,
      "avvolgibile_laterale",
      25,
      "sx",
      "no",
      false,
    );
    expect(fixed.forme.some((f) => f.ruolo === "rete")).toBe(true);
    expect(
      lateral.forme.some(
        (f) =>
          f.kind === "poly" &&
          f.ruolo === "telaio" &&
          f.punti.every(([, y]) => y >= 1375),
      ),
    ).toBe(false);
    expect(fixed.quote).toHaveLength(2);
  });
  it("converte cm in mm senza alterare i valori del rilievo", () => {
    const { type, values } = setup(),
      before = structuredClone(values);
    const d = windowSurveyDrawing(type, values)!;
    expect(d.scene.larghezza).toBe(1200);
    expect(d.scene.altezza).toBe(1400);
    expect(d.basis).toMatch(/foro/);
    expect(values).toEqual(before);
  });
  it("non inventa unità o quote mancanti", () => {
    const { type, values } = setup();
    expect(
      windowSurveyDrawing(type, { ...values, larghezza_foro: null }),
    ).toBeNull();
    const changed = structuredClone(type);
    changed.sections
      .flatMap((s) => s.fields)
      .find((f) => f.key === "larghezza_foro")!.unit = undefined;
    expect(dimensionMm(changed, values, "larghezza_foro")).toBeNull();
    expect(windowSurveyDrawing(changed, values)).toBeNull();
    expect(
      windowSurveyDrawing(type, { ...values, larghezza_foro: Infinity }),
    ).toBeNull();
  });
  it("non usa il numero delle sole ante apribili per il numero totale", () => {
    expect(leafCount({ tipologia: "finestra_3ante", n_ante: 1 })).toBe(3);
    expect(leafCount({ tipologia: "scorrevole" })).toBe(0);
    expect(leafCount({ tipologia: "scorrevole", rv_total_leaves: 4 })).toBe(4);
    expect(leafCount({ rv_total_leaves: 99 })).toBe(0);
  });
  it("non confonde il DX sintetico legacy con il lato delle cerniere", () => {
    const { type, values } = setup();
    expect(windowSurveyDrawing(type, values)!.warnings).toHaveLength(2);
    const explicit = {
      ...values,
      rv_leaf_0_type: "anta_ribalta",
      rv_leaf_0_side: "sx",
      rv_leaf_1_type: "battente",
      rv_leaf_1_side: "dx",
    };
    const d = windowSurveyDrawing(type, explicit)!;
    expect(d.warnings).toEqual([]);
    expect(d.drawing!.ante).toEqual([
      { tipo: "anta_ribalta", lato: "sx" },
      { tipo: "battente", lato: "dx" },
    ]);
    expect(windowSurveyDrawing(type, explicit, "esterna")!.drawing!.vista).toBe(
      "esterna",
    );
  });
  it("usa la Z solo quando può rappresentare i lati senza inventarli", () => {
    const { type, values } = setup();
    expect(
      windowSurveyDrawing(type, {
        ...values,
        tipo_telaio: "z_65",
        lati_con_z: ["sx", "dx", "alto", "basso"],
      })!.drawing!.telaio,
    ).toEqual({ tipo: "Z", alettaMm: 65 });
    const partial = {
      ...values,
      tipo_telaio: "z_35",
      lati_con_z: ["sx", "dx", "alto"],
    };
    expect(windowSurveyDrawing(type, partial)!.drawing!.telaio).toBeUndefined();
    expect(windowSurveyIssues(type, partial).join(" ")).toMatch(/Z parziale/);
  });
  it("non forza tipologie speciali in una finestra standard", () => {
    const { type, values } = setup();
    const d = windowSurveyDrawing(type, {
      ...values,
      tipologia: "bow_window",
    })!;
    expect(d.drawing).toBeUndefined();
    expect(d.warnings.join(" ")).toMatch(/speciale/);
  });
  it("il portoncino non viene rappresentato come una porta vetrata", () => {
    const { detail } = setup();
    const type = detail.template.schema.element_types.find(
      (t) => t.key === "portoncino_blindato",
    )!;
    const d = windowSurveyDrawing(type, {
      larghezza: 90,
      altezza: 210,
      tipologia: "1_anta",
      rv_leaf_0_type: "battente",
      rv_leaf_0_side: "dx",
    })!;
    expect(d.scene.forme.some((f) => f.ruolo === "vetro")).toBe(false);
    expect(d.scene.forme.some((f) => f.ruolo === "pannello")).toBe(true);
  });
  it("il telo tapparella non riceve un cassonetto o quote aggiuntive dedotte", () => {
    const { detail } = setup();
    const type = detail.template.schema.element_types.find(
      (t) => t.key === "tapparella_standalone",
    )!;
    const d = windowSurveyDrawing(type, { larghezza: 118, altezza: 160 })!;
    expect(d.scene.quote).toHaveLength(2);
    expect(d.scene.quote.map((q) => q.testo)).toEqual(["1180 mm", "1600 mm"]);
    expect(d.scene.forme.some((f) => f.ruolo === "cassonetto")).toBe(false);
  });
  it("segnala profili impossibili senza correggere silenziosamente i dati", () => {
    const { detail, type, values } = setup();
    const zan = detail.template.schema.element_types.find(
      (t) => t.key === "zanzariera_standalone",
    )!;
    expect(
      windowSurveyIssues(zan, {
        larghezza: 120,
        altezza: 140,
        larghezza_telaio: 120,
      }).join(" "),
    ).toMatch(/occuper/);
    expect(() =>
      validateWindowSurvey(type, { ...values, larghezza_foro: 0 }),
    ).toThrow(/positive/);
  });
  it("distingue quote rilevate e finite, richiedendo riferimento e conferma", () => {
    const { type, values } = setup();
    const finite = { ...values, rv_order_width: 1180, rv_order_height: 1380 };
    expect(windowSurveyDrawing(type, finite, "interna", true)).toBeNull();
    expect(windowOrderVerified({ ...finite, rv_order_checked: true })).toBe(
      false,
    );
    expect(() =>
      validateWindowSurvey(type, { ...finite, rv_order_checked: true }),
    ).toThrow(/riferimento/);
    const checked = {
      ...finite,
      rv_order_checked: true,
      rv_order_reference: "Verifica tecnico · TEST",
    };
    expect(
      windowSurveyDrawing(type, checked, "interna", true)!.scene.larghezza,
    ).toBe(1180);
    expect(windowSurveyDrawing(type, checked)!.scene.larghezza).toBe(1200);
    expect(windowOrderVerified(checked)).toBe(true);
  });
  it("una variazione tecnica annulla la verifica, una nota non la annulla", () => {
    const previous = {
      rv_order_checked: true,
      rv_order_width: 1180,
      rv_order_height: 1380,
      rv_order_reference: "TEST",
      larghezza_foro: 120,
    };
    expect(
      windowSurveyDraftValues(previous, { ...previous, larghezza_foro: 122 })
        .rv_order_checked,
    ).toBe(false);
    expect(
      windowSurveyDraftValues(previous, { ...previous, rv_leaf_0_side: "dx" })
        .rv_order_checked,
    ).toBe(false);
    expect(
      windowSurveyDraftValues(previous, {
        ...previous,
        rv_trim_finish: "Bianco",
      }).rv_order_checked,
    ).toBe(true);
  });
  it("applica finiture generali senza copiarle nei dati del singolo pezzo", () => {
    const { detail, type, values } = setup();
    const shown = windowDisplayValues(type, values, detail.survey.header_data);
    expect(windowSurveyDrawing(type, shown)!.internal?.nome).toBe("RAL 9010");
    expect(windowSurveyDrawing(type, shown)!.external?.nome).toBe("RAL 7016");
    expect(
      windowDisplayValues(
        type,
        { ...values, colore_interno: "#123456" },
        detail.survey.header_data,
      ).colore_interno,
    ).toBe("#123456");
    expect(values.colore_interno).toBeUndefined();
  });
  it("non usa il foro infisso per un complemento privo di misure", () => {
    const { type, values } = setup();
    const projected = windowComponentData(
      type,
      { ...values, complementi: ["tapparella"] },
      "tapparella",
    );
    expect(windowSurveyDrawing(projected.type, projected.values)).toBeNull();
    const filled = windowComponentData(
      type,
      { ...values, tap_larghezza: 115, tap_altezza: 160 },
      "tapparella",
    );
    expect(
      windowSurveyDrawing(filled.type, filled.values)!.scene.larghezza,
    ).toBe(1150);
    expect(windowSurveyDrawing(filled.type, filled.values)!.scene.altezza).toBe(
      1600,
    );
  });
  it.each([
    "tapparella_standalone",
    "persiana_standalone",
    "cassonetto_standalone",
    "zanzariera_standalone",
    "portoncino_blindato",
  ])("copre il modello reale %s", (key) => {
    const { detail } = setup();
    const type = detail.template.schema.element_types.find(
      (t) => t.key === key,
    )!;
    const d = windowSurveyDrawing(type, {
      larghezza: 120,
      altezza: 270,
      n_ante: 2,
      tipo: "battente",
      tipologia: "1_anta",
    });
    expect(d!.scene.larghezza).toBe(1200);
    expect(d!.scene.altezza).toBe(2700);
    expect(windowSurveySections(type).length).toBeGreaterThan(
      type.sections.length,
    );
  });
  it("somma solo lunghezze inserite, senza aggiungere lati o sfridi", () => {
    const t = trimMetres(
      {
        rv_trim_sx_length: 1400,
        rv_trim_dx_length: 1400,
        rv_trim_alto_length: 1200,
      },
      3,
    );
    expect(t).toEqual({ entered: 3, perElement: 4, total: 12 });
    expect(trimMetres({ rv_trim_sx_length: -1 }).entered).toBe(0);
  });
  it("valida punti, coordinate e fotografie dello stesso elemento", () => {
    const { detail, type, values } = setup();
    const pin = {
      id: "pin1",
      x: 0.3,
      y: 0.7,
      view: "esterna",
      component: "cassonetto",
      text: "Verificare accesso",
    };
    expect(readWindowPins({ [WINDOW_PINS]: [pin] })).toEqual([pin]);
    expect(() =>
      validateWindowSurvey(type, { [WINDOW_PINS]: [{ ...pin, x: Infinity }] }),
    ).toThrow(/punti/);
    expect(() =>
      surveyElementPatch(detail, detail.elements[0], {
        ...detail.elements[0],
        values: {
          ...values,
          [WINDOW_PINS]: [{ ...pin, photoId: "altra-azienda" }],
        },
      }),
    ).toThrow(/foto/);
  });
  it("valida extra anche nascosti e conserva i dati storici senza toccare relazioni", () => {
    const { detail, type, values } = setup();
    expect(() =>
      validateWindowSurvey(type, { ...values, rv_guide_sx: -12 }),
    ).toThrow(/misure/);
    expect(() =>
      validateWindowSurvey(type, { ...values, rv_total_leaves: 1.5 }),
    ).toThrow(/ante/);
    const patch = surveyElementPatch(detail, detail.elements[0], {
      ...detail.elements[0],
      values: { ...values, legacy_key: "conservata", rv_cielino_width: 1100 },
    });
    expect(patch.values.legacy_key).toBe("conservata");
    expect(patch).not.toHaveProperty("survey_id");
  });
  it("espone nel report/PDF le specifiche compilate, non JSON o pagine vuote", () => {
    const { detail, values } = setup();
    detail.elements[0].values = {
      ...values,
      rv_trim_sx_length: 1400,
      rv_leaf_0_type: "battente",
      rv_leaf_0_side: "sx",
      [WINDOW_PINS]: [
        {
          id: "a",
          x: 0.5,
          y: 0.5,
          text: "Verificare mazzetta",
          view: "interna",
        },
      ],
    };
    const fields = buildSurveyReport(detail)
      .areas[0].elements[0].sections.filter((s) => s.key.startsWith("rv_"))
      .flatMap((s) => s.fields);
    expect(fields.some((f) => f.value.includes("Verificare mazzetta"))).toBe(
      true,
    );
    expect(fields.some((f) => f.label.includes("Coprifili"))).toBe(true);
    expect(fields.some((f) => f.value === "[object Object]")).toBe(false);
    expect(fields.every((f) => !f.missing)).toBe(true);
  });
});
