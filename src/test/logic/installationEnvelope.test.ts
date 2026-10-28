import { describe, expect, it } from "vitest";
import {
  installationEnvelope,
  ENVELOPE_MEASURE_KEYS,
} from "@/lib/surveys/installationEnvelope";
import {
  windowSurveyDrawing,
  windowComponentData,
  windowSurveyIssues,
  windowSurveyDraftValues,
  validateWindowSurvey,
  windowSurveySections,
} from "@/lib/surveys/windowSurvey";
import {
  ENVELOPE_EXAMPLES,
  envelopeExampleType,
} from "../fixtures/installationEnvelopes";
import { makeWindowSurveyDetail } from "../fixtures/windowSurvey";
describe("Spessori e ingombri tecnici del sopralluogo", () => {
  it.each([
    ["verticale", "molla"],
    ["verticale", "frizionata"],
    ["verticale", "catena"],
    ["verticale", "motore"],
    ["orizzontale", "molla"],
    ["orizzontale", "plisse"],
    ["battente", "manuale"],
    ["fissa", "fissa"],
  ])(
    "zanzariera %s / %s: spessori disponibili senza inventare una raccolta per fisse e battenti",
    (direction, mechanism) => {
      const e = ENVELOPE_EXAMPLES[3],
        values = {
          ...e.values,
          rv_zan_direction: direction,
          rv_zan_mechanism: mechanism,
          rv_zan_side: direction === "verticale" ? "alto" : "sx",
        };
      const d = windowSurveyDrawing(envelopeExampleType(e), values)!;
      expect(
        d.installation?.measurements.find((m) => m.key === "rv_zan_total_depth")
          ?.value,
      ).toBe(45);
      expect(
        d.installation!.sketches.some((s) => s.title.includes("Raccolta")),
      ).toBe(!["fissa", "battente"].includes(direction));
    },
  );
  it("non inventa sezioni o quote quando mancano i dati", () => {
    const data = installationEnvelope("tapparella_standalone", {})!;
    expect(data.sketches).toHaveLength(0);
    expect(data.measurements.every((m) => m.value === null)).toBe(true);
    expect(data.warnings).toEqual([]);
  });
  it("mantiene separati profondità della guida, luce e massimo spessore telo", () => {
    const e = ENVELOPE_EXAMPLES[1],
      type = envelopeExampleType(e);
    const d = windowSurveyDrawing(type, e.values)!;
    expect(d.scene.larghezza).toBe(1200);
    expect(d.installation!.sketches[0].scene.quote.map((q) => q.testo)).toEqual(
      ["30 mm", "25 mm"],
    );
    expect(d.installation!.warnings).toEqual([]);
    expect(d.scene.forme.find((f) => f.ruolo === "lamellaLinea")).toMatchObject(
      {
        punti: [
          [0, 45],
          [1200, 45],
        ],
      },
    );
    const withoutLimit = installationEnvelope(e.type, {
      ...e.values,
      rv_tap_max_thickness: undefined,
    })!;
    expect(withoutLimit.warnings.join(" ")).toContain("Limite di spessore");
  });
  it("segnala le tre incompatibilità simulate senza cambiare il telo", () => {
    const e = ENVELOPE_EXAMPLES[2];
    const d = windowSurveyDrawing(envelopeExampleType(e), e.values)!;
    expect(d.installation!.warnings).toHaveLength(3);
    expect(
      windowSurveyIssues(envelopeExampleType(e), e.values).join(" "),
    ).toContain("possibile incompatibilità");
    expect(d.scene.larghezza).toBe(1200);
  });
  it.each(ENVELOPE_EXAMPLES.slice(3, 5))(
    "$label: applica al frontale guida, soglia e raccolta misurate",
    (e) => {
      const d = windowSurveyDrawing(envelopeExampleType(e), e.values)!;
      const boxes = d.scene.forme.filter(
        (f) => f.kind === "rect" && f.ruolo === "cassonetto",
      );
      expect(boxes).toHaveLength(e.values.rv_zan_panels === "doppia" ? 2 : 1);
      for (const box of boxes) {
        if (box.kind !== "rect") throw new Error("Raccolta mancante");
        expect(e.values.rv_zan_direction === "verticale" ? box.h : box.w).toBe(
          e.values.rv_zan_pack_width,
        );
      }
      expect(d.installation!.sketches).toHaveLength(2);
    },
  );
  it("non mostra raccolta per rete fissa e non converte vecchi ingombri ambigui", () => {
    const fixed = ENVELOPE_EXAMPLES[5];
    expect(
      installationEnvelope(fixed.type, {
        ...fixed.values,
        rv_zan_pack_width: 100,
      })!.measurements.some((m) => m.key.includes("_pack_")),
    ).toBe(false);
    const legacy = installationEnvelope("zanzariera_standalone", {
      rv_zan_cassette_size: 45,
    })!;
    expect(legacy.sketches).toHaveLength(0);
    expect(legacy.warnings.join(" ")).toContain("non definisce l’asse");
  });
  it("controlla profondità, raccolta e soglia incompatibili senza certificare i casi senza avvisi", () => {
    const e = ENVELOPE_EXAMPLES[3];
    const data = installationEnvelope(
      e.type,
      {
        ...e.values,
        rv_zan_space: 0,
        rv_zan_pack_width: 2000,
        rv_zan_bottom_rail: "no",
      },
      { width: 1000, height: 1400 },
    )!;
    expect(data.warnings.join(" ")).toMatch(/supera lo spazio utile/);
    expect(data.warnings.join(" ")).toMatch(/tutto il campo/);
    expect(data.warnings.join(" ")).toMatch(/senza guida/);
    expect(data.measurements.find((m) => m.key === "rv_zan_space")?.value).toBe(
      0,
    );
    expect(data.caption).toContain("non certifica");
    expect(
      installationEnvelope(e.type, {
        ...e.values,
        rv_zan_total_depth: 20,
      })!.warnings.join(" "),
    ).toContain("supera quella totale");
  });
  it("blindato: non confonde spessore anta, telaio e controtelaio o deduce il movimento dalla maniglia", () => {
    const e = ENVELOPE_EXAMPLES[0],
      type = envelopeExampleType(e);
    const original = structuredClone(e.values);
    const d = windowSurveyDrawing(type, e.values)!;
    expect(d.installation!.sketches.map((s) => s.scene.quote[0].testo)).toEqual(
      ["85 mm", "95 mm", "100 mm"],
    );
    expect(d.detail?.title).toContain("apertura");
    expect(e.values).toEqual(original);
    expect(
      installationEnvelope(e.type, {
        ...e.values,
        rv_door_space_internal: 30,
      })!.warnings.join(" "),
    ).toContain("maniglia");
  });
  it("funziona anche sui complementi collegati senza ereditare le dimensioni della finestra", () => {
    const type = makeWindowSurveyDetail().template.schema.element_types.find(
      (t) => t.key === "infisso",
    )!;
    const values = {
      larghezza_foro: 200,
      altezza_foro: 250,
      complementi: ["tapparella"],
      tap_larghezza: 120,
      tap_altezza: 140,
      ...ENVELOPE_EXAMPLES[2].values,
    };
    const projected = windowComponentData(type, values, "tapparella");
    expect(
      windowSurveyDrawing(projected.type, projected.values)!.scene.larghezza,
    ).toBe(1200);
    expect(windowSurveyIssues(type, values).join(" ")).toContain(
      "massimo ammesso",
    );
  });
  it.each([...ENVELOPE_MEASURE_KEYS])(
    "valida %s e invalida la verifica d’ordine dopo una modifica",
    (key) => {
      const e = ENVELOPE_EXAMPLES[0],
        type = envelopeExampleType(e);
      expect(() =>
        validateWindowSurvey(type, { ...e.values, [key]: -1 }),
      ).toThrow(/spessori e ingombri/);
      expect(() =>
        validateWindowSurvey(type, { ...e.values, [key]: NaN }),
      ).toThrow();
      expect(() =>
        validateWindowSurvey(type, { ...e.values, [key]: "20" }),
      ).toThrow();
      const before = { ...e.values, rv_order_checked: true };
      expect(
        windowSurveyDraftValues(before, { ...before, [key]: 20 }, type)
          .rv_order_checked,
      ).not.toBe(true);
    },
  );
  it.each(ENVELOPE_EXAMPLES)("campi $label senza duplicati", (e) => {
    const keys = windowSurveySections(envelopeExampleType(e)).flatMap((s) =>
      s.fields.map((f) => f.key),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
});
