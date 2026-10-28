import { describe, it, expect } from "vitest";
import {
  doorSurveyScene,
  INTERNAL_DOOR_TYPE,
  withSurveyDoorProducts,
} from "@/lib/surveys/doorSurvey";
import {
  windowSurveyDrawing,
  windowSurveySections,
  windowDisplayValues,
  windowSurveyDraftValues,
  windowSurveyIssues,
  windowSurveyReportSections,
  validateWindowSurvey,
  mosquitoKind,
} from "@/lib/surveys/windowSurvey";
import { sectionsForSurveyStep } from "@/lib/surveys/elementWorkflow";
import { makeWindowSurveyDetail } from "../fixtures/windowSurvey";
import { mosquitoScene } from "@/lib/surveys/windowComponentScenes";
const blindato = () =>
  makeWindowSurveyDetail().template.schema.element_types.find(
    (t) => t.key === "portoncino_blindato",
  )!;
const zan = () =>
  makeWindowSurveyDetail().template.schema.element_types.find(
    (t) => t.key === "zanzariera_standalone",
  )!;
const base = {
  tipologia: "1_anta",
  larghezza: 90,
  altezza: 210,
  rv_door_layout: "singola",
  rv_door_hinge: "sx",
  rv_door_swing: "spingere",
  rv_door_counterframe: "nuovo",
};
describe("Porte e zanzariere · rilievo tecnico condiviso", () => {
  it("mantiene le sezioni aziendali omonime senza duplicare o perdere nuovi campi nel report", () => {
    const type = blindato();
    type.sections.push({
      key: "rv_door",
      label: "Verso aziendale",
      fields: [
        {
          key: "rv_door_hinge",
          label: "Cerniera aziendale",
          type: "select",
          options: [{ value: "sx", label: "Sinistra personalizzata" }],
        },
      ],
    });
    const sections = windowSurveySections(type);
    expect(sections.filter((s) => s.key === "rv_door")).toHaveLength(1);
    expect(
      sections
        .flatMap((s) => s.fields)
        .filter((f) => f.key === "rv_door_hinge"),
    ).toHaveLength(1);
    const report = windowSurveyReportSections(
      type,
      { ...base, rv_door_swing: "spingere" },
      1,
    )!;
    expect(
      report.sections
        .flatMap((s) => s.fields)
        .some((f) => f.key === "rv_door_swing"),
    ).toBe(true);
  });
  it("mantiene coerente il tipo storico della zanzariera senza alterare la tipologia dell’infisso", () => {
    expect(
      windowSurveyDraftValues(
        { tipo: "fissa" },
        {
          tipo: "fissa",
          rv_zan_direction: "orizzontale",
          rv_zan_mechanism: "plisse",
        },
        zan(),
      ).tipo,
    ).toBe("plissettata");
    const inf = makeWindowSurveyDetail().template.schema.element_types.find(
      (t) => t.key === "infisso",
    )!;
    const v = windowSurveyDraftValues(
      { tipologia: "finestra_2ante" },
      { tipologia: "finestra_2ante", rv_zan_direction: "verticale" },
      inf,
    );
    expect(v.zan_tipo).toBe("avvolgibile_verticale");
    expect(v.tipologia).toBe("finestra_2ante");
  });
  it.each(["sx", "dx", "entrambi"])(
    "fiancoluce %s e sopraluce: quote indipendenti e vetri dedicati",
    (side) => {
      const d = doorSurveyScene(
        1600,
        2500,
        {
          ...base,
          rv_door_sidelights: side,
          rv_door_sidelight_left_width: 300,
          rv_door_sidelight_right_width: 250,
          rv_door_toplight: "fisso",
          rv_door_toplight_height: 350,
        },
        true,
      );
      expect(d.scene.forme.filter((f) => f.ruolo === "vetro")).toHaveLength(
        side === "entrambi" ? 3 : 2,
      );
      expect(d.scene.quote.some((q) => q.testo.includes("Fiancoluce"))).toBe(
        true,
      );
      expect(d.scene.larghezza).toBe(1600);
      expect(d.scene.altezza).toBe(2500);
    },
  );
  it("fiancoluce non quotati: non inventa larghezze né misure d’anta", () => {
    const d = doorSurveyScene(
      1500,
      2300,
      { ...base, rv_door_sidelights: "entrambi" },
      true,
    );
    expect(d.scene.forme.some((f) => f.ruolo === "vetro")).toBe(false);
    expect(d.warnings.join(" ")).toMatch(/Fiancoluce.*rileva/);
    expect(d.plan).toBeNull();
  });
  it.each(["da_murare", "murato"])(
    "distingue controtelaio %s senza certificare il riutilizzo",
    (state) => {
      expect(
        doorSurveyScene(
          900,
          2100,
          { ...base, rv_door_frame_state: state },
          true,
        ).warnings.join(" "),
      ).toMatch(
        state === "murato" ? /già murato.*non è automatico/ : /da murare/,
      );
    },
  );
  it("integra la porta interna solo nel modello standard infissi senza mutazioni o duplicati", () => {
    const t = makeWindowSurveyDetail().template;
    t.is_system = true;
    const enriched = withSurveyDoorProducts(t);
    expect(
      enriched.schema.element_types.filter((t) => t.key === "porta_interna"),
    ).toHaveLength(1);
    expect(t.schema.element_types.some((t) => t.key === "porta_interna")).toBe(
      false,
    );
    expect(withSurveyDoorProducts(enriched)).toBe(enriched);
    const custom = { ...t, is_system: false };
    expect(withSurveyDoorProducts(custom)).toBe(custom);
  });
  it.each(["sx", "dx"])(
    "blindato %s a spingere: specchio, simboli e pianta coerenti",
    (hinge) => {
      const a = doorSurveyScene(
        900,
        2100,
        { ...base, rv_door_hinge: hinge },
        true,
      );
      const b = doorSurveyScene(
        900,
        2100,
        { ...base, rv_door_hinge: hinge },
        false,
      );
      const symbols = a.scene.forme.filter((f) => f.ruolo === "simbolo");
      expect(symbols).toHaveLength(1);
      expect(symbols[0]).toHaveProperty("tratteggio", true);
      expect(b.scene.forme.find((f) => f.ruolo === "simbolo")).toHaveProperty(
        "tratteggio",
        false,
      );
      const x = a.scene.forme.find((f) => f.ruolo === "maniglia"),
        y = b.scene.forme.find((f) => f.ruolo === "maniglia");
      if (x?.kind === "rect" && y?.kind === "rect")
        expect(y.x).toBeCloseTo(900 - x.x - x.w);
      expect(a.plan).not.toBeNull();
      expect(a.scene.forme.some((f) => f.ruolo === "vetro")).toBe(false);
    },
  );
  it.each(["spingere", "tirare"])(
    "doppia asimmetrica con sopraluce e pianta %s",
    (swing) => {
      const d = doorSurveyScene(
        1500,
        2500,
        {
          ...base,
          rv_door_layout: "doppia_asimmetrica",
          rv_door_split_mm: 1000,
          rv_door_active_side: "sx",
          rv_door_secondary: "semifissa",
          rv_door_swing: swing,
          rv_door_toplight: "fisso",
          rv_door_toplight_height: 350,
        },
        true,
      );
      expect(d.scene.forme.filter((f) => f.ruolo === "pannello")).toHaveLength(
        2,
      );
      expect(d.scene.forme.filter((f) => f.ruolo === "vetro")).toHaveLength(1);
      expect(d.scene.quote.map((q) => q.testo)).toContain("Sopraluce 350 mm");
      expect(
        d.scene.quote.some((q) => q.testo.includes("Divisorio 1000 mm")),
      ).toBe(true);
      const arcs = d.plan!.forme.filter(
        (f) => f.kind === "poly" && f.punti.length === 25,
      );
      expect(arcs).toHaveLength(2);
      for (const arc of arcs)
        if (arc.kind === "poly")
          expect(
            arc.punti.every(([, y]) =>
              swing === "spingere"
                ? y >= arc.punti[0][1] - 0.001
                : y <= arc.punti[0][1] + 0.001,
            ),
          ).toBe(true);
    },
  );
  it("seconda anta fissa non riceve un simbolo d’apertura", () => {
    const d = doorSurveyScene(
      1500,
      2100,
      {
        ...base,
        rv_door_layout: "doppia_simmetrica",
        rv_door_active_side: "sx",
        rv_door_secondary: "fissa",
      },
      true,
    );
    expect(d.scene.forme.filter((f) => f.ruolo === "simbolo")).toHaveLength(1);
    expect(
      d.plan!.forme.filter((f) => f.kind === "poly" && f.punti.length === 25),
    ).toHaveLength(1);
  });
  it.each([undefined, 0, -5, 1500, 2000, NaN])(
    "quota divisoria %s non genera ante inventate",
    (split) => {
      const d = doorSurveyScene(
        1500,
        2100,
        {
          ...base,
          rv_door_layout: "doppia_asimmetrica",
          rv_door_split_mm: split,
        },
        true,
      );
      expect(d.scene.forme.filter((f) => f.ruolo === "pannello")).toHaveLength(
        1,
      );
      expect(d.warnings.join(" ")).toMatch(/quota divisoria/);
      expect(d.plan).toBeNull();
    },
  );
  it("non inventa il sopraluce né l’apertura a spingere in assenza di misure/conferma", () => {
    const d = doorSurveyScene(900, 2100, { rv_door_toplight: "fisso" }, true);
    expect(
      d.scene.forme.some((f) => f.ruolo === "vetro" || f.ruolo === "simbolo"),
    ).toBe(false);
    expect(d.warnings.join(" ")).toMatch(/Sopraluce/);
    expect(d.warnings.join(" ")).toMatch(/Controtelaio/);
    expect(d.plan).toBeNull();
  });
  it("mantiene sincronizzato il vecchio campo del blindato ma non cambia la tipologia di una porta interna", () => {
    const v = windowSurveyDraftValues(
      base,
      { ...base, rv_door_layout: "doppia_asimmetrica" },
      blindato(),
    );
    expect(v.tipologia).toBe("2_ante");
    expect(
      windowSurveyDraftValues(
        { tipologia: "scorrevole_scomparsa" },
        { tipologia: "scorrevole_scomparsa", rv_door_layout: "singola" },
        INTERNAL_DOOR_TYPE,
      ).tipologia,
    ).toBe("scorrevole_scomparsa");
  });
  it("la verifica d’ordine decade modificando configurazione o meccanismo, non salva nulla", () => {
    const v = {
      ...base,
      rv_order_checked: true,
      rv_order_width: 900,
      rv_order_height: 2100,
      rv_order_reference: "TEST",
    };
    expect(
      windowSurveyDraftValues(v, { ...v, rv_door_toplight: "fisso" })
        .rv_order_checked,
    ).toBe(false);
    expect(
      windowSurveyDraftValues(v, { ...v, rv_zan_mechanism: "molla" })
        .rv_order_checked,
    ).toBe(false);
    expect(() =>
      validateWindowSurvey(blindato(), { ...base, rv_order_checked: true }),
    ).toThrow(/riferimento/);
  });
  it.each([
    "battente",
    "scorrevole_esterno",
    "scorrevole_scomparsa",
    "a_libro",
    "a_soffietto",
    "rototraslante",
  ])("porta interna %s: geometria e riferimento A/B", (tipologia) => {
    const values = {
      ...base,
      larghezza: 800,
      altezza: 2100,
      tipologia,
      rv_door_side_a: "Corridoio",
      rv_door_side_b: "Camera",
      rv_door_slide_side: "dx",
    };
    const d = windowSurveyDrawing(INTERNAL_DOOR_TYPE, values, "esterna")!;
    expect(d.scene.larghezza).toBe(800);
    expect(d.scene.quote.map((q) => q.testo)).toContain("2100 mm");
    if (tipologia === "battente")
      expect(d.detail?.caption).toContain("Corridoio / Camera");
    if (tipologia.startsWith("scorrevole")) {
      if (tipologia === "scorrevole_scomparsa") {
        expect(d.detail?.title).toMatch(/Scorrimento/);
        expect(d.detail?.labels).toEqual({ top: "LATO B", bottom: "LATO A" });
      } else expect(d.detail).toBeUndefined(); // The wall face A/B has not been confirmed.
      expect(d.scene.forme.some((f) => f.ruolo === "binario")).toBe(true);
    }
    if (tipologia === "rototraslante")
      expect(d.warnings.join(" ")).toMatch(/produttore/);
  });
  it("finiture separate e nessuna eredità del colore degli infissi per la porta interna", () => {
    const vals = windowDisplayValues(
      INTERNAL_DOOR_TYPE,
      { colore_interno: "RAL 9010", colore_esterno: "RAL 7016" },
      { colore_interno_infissi: "RAL 3000" },
    );
    const d = windowSurveyDrawing(INTERNAL_DOOR_TYPE, {
      ...vals,
      larghezza: 800,
      altezza: 2100,
      tipologia: "battente",
    })!;
    expect(d.internal).not.toEqual(d.external);
    expect(
      windowDisplayValues(
        INTERNAL_DOOR_TYPE,
        {},
        { colore_interno_infissi: "RAL 3000" },
      ).colore_interno,
    ).toBeUndefined();
  });
  it("controtelaio, sopraluce, colori e riferimenti sono nel report e in quattro passi senza duplicati", () => {
    const sections = windowSurveySections(blindato());
    const all = Array.from({ length: 4 }, (_, i) =>
      sectionsForSurveyStep(sections, i),
    )
      .flat()
      .flatMap((s) => s.fields.map((f) => f.key));
    expect(new Set(all).size).toBe(all.length);
    for (const key of [
      "rv_door_counterframe",
      "rv_door_frame_width",
      "rv_door_toplight_height",
      "rv_door_split_mm",
      "colore_interno",
      "colore_esterno",
    ])
      expect(all).toContain(key);
  });
  it.each(["molla", "frizionata", "catena", "motore"])(
    "zanzariera verticale %s: cassonetto alto e comando distinto",
    (mechanism) => {
      const values = {
        larghezza: 100,
        altezza: 140,
        tipo: "avvolgibile_verticale",
        rv_zan_direction: "verticale",
        rv_zan_mechanism: mechanism,
      };
      const d = windowSurveyDrawing(zan(), values)!;
      expect(
        d.scene.forme.some(
          (f) => f.kind === "rect" && f.ruolo === "cassonetto" && f.y === 0,
        ),
      ).toBe(true);
      if (mechanism === "motore")
        expect(d.scene.forme.some((f) => f.ruolo === "motore")).toBe(true);
      if (mechanism === "catena")
        expect(d.scene.forme.filter((f) => f.ruolo === "cintino")).toHaveLength(
          15,
        );
    },
  );
  it("orizzontale plissettata doppia: due raccolte, incontro centrale e cingolo; senza quote a metà inventate", () => {
    const s = mosquitoScene(1600, 2200, "plissettata", 25, "", "si", false, {
      mechanism: "plisse",
      panels: "doppia",
      guide: "carrarmato",
    });
    expect(s.forme.filter((f) => f.ruolo === "cassonetto")).toHaveLength(2);
    expect(s.forme.filter((f) => f.ruolo === "binario")).toHaveLength(40);
    expect(s.quote.map((q) => q.testo)).toEqual(["1600 mm", "2200 mm"]);
    expect(
      mosquitoKind({
        rv_zan_direction: "orizzontale",
        rv_zan_mechanism: "plisse",
      }),
    ).toBe("plissettata");
  });
  it("segnala scelte discordanti e rifiuta valori tecnici non finiti o opzioni sconosciute", () => {
    expect(
      windowSurveyIssues(zan(), {
        rv_zan_direction: "fissa",
        rv_zan_mechanism: "molla",
      }).join(" "),
    ).toMatch(/discordanti/);
    expect(() =>
      validateWindowSurvey(blindato(), { ...base, rv_door_frame_width: NaN }),
    ).toThrow(/misure tecniche/);
    expect(() =>
      validateWindowSurvey(blindato(), {
        ...base,
        rv_door_layout: "altro_inventato",
      }),
    ).toThrow(/scelta/);
  });
});
