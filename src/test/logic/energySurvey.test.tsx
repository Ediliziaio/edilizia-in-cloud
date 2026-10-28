/// <reference types="node" />
import { describe, it, expect } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import {
  makeEnergySurvey,
  ENERGY_SCENARIOS,
  ENERGY_CATALOG,
} from "../fixtures/energySurvey";
import {
  withEnergySurveyProducts,
  energyIssues,
  shouldEnrichEnergySurvey,
} from "@/lib/surveys/energySurvey";
import {
  energyGeometryIssues,
  energyScene,
  proposeEnergyLayout,
  validateEnergyValues,
} from "@/lib/surveys/energyDrawing";
import {
  energyQuoteRows,
  energyQuoteModule,
  energyQuoteHref,
  energyFvPatch,
  energyComputoRows,
} from "@/lib/surveys/energyQuote";
import { sectionsForSurveyStep } from "@/lib/surveys/elementWorkflow";
import { surveyMedia } from "../fixtures/surveyDetail";
import { buildSurveyReport } from "@/lib/surveys/report";
import { renderSurveyPdf } from "@/lib/surveys/reportPdf";
import { copySurveyValues } from "@/lib/surveys/copyElement";
import { INITIAL } from "@/pages/azienda/fotovoltaico/FotovoltaicoWizard/constants";
import {
  applyEnergyFvImport,
  energySurveyOrigin,
} from "@/lib/surveys/energyQuote";
import { righeComponentiFv } from "@/lib/fotovoltaico/componentiConfigurazione";
import { problemiConfigurazioneFv } from "@/lib/fotovoltaico/configurazioneValidation";
const selection = {
  panelId: "sim-panel",
  inverterId: "sim-inverter",
  batteryId: "sim-battery",
  acknowledge: true,
};
describe("Sopralluoghi energetici completi · simulazioni isolate", () => {
  it("non aggiunge nuovi obblighi ai rilievi storici firmati e privi di dati energia", () => {
    const d = makeEnergySurvey();
    expect(
      shouldEnrichEnergySurvey(
        { ...d.survey, status: "signed", header_data: {} },
        [],
      ),
    ).toBe(false);
    expect(
      shouldEnrichEnergySurvey(
        { ...d.survey, status: "completed", header_data: {} },
        [],
      ),
    ).toBe(false);
    expect(
      shouldEnrichEnergySurvey(
        { ...d.survey, status: "draft", header_data: {} },
        [],
      ),
    ).toBe(true);
    expect(
      shouldEnrichEnergySurvey({ ...d.survey, status: "signed" }, d.elements),
    ).toBe(true);
  });
  it("il disegno non inventa spazi liberi usando l’ingombro dell’intero locale", () => {
    const d = makeEnergySurvey("pdc"),
      e = d.elements[0],
      t = d.template.schema.element_types.find(
        (t) => t.key === e.element_type,
      )!;
    const scene = energyScene(t, e.values);
    expect(scene.width).toBe(1500);
    expect(scene.height).toBe(1250);
    expect(
      energyScene(t, { ...e.values, en_free_front: undefined }).caption,
    ).toContain("frontale non rilevato");
  });
  it("FV: quantità, prezzi e metri restano coerenti nel payload nativo, senza duplicati", () => {
    const d = makeEnergySurvey(),
      rows = energyQuoteRows(d, "company1").filter(
        (r) => !["roof", "inverter", "battery"].includes(r.kind),
      ),
      prices = Object.fromEntries(rows.map((r) => [r.key, "15"]));
    const draft = applyEnergyFvImport(
      structuredClone(INITIAL),
      d,
      "company1",
      ENERGY_CATALOG,
      selection,
      rows,
      prices,
    );
    expect(problemiConfigurazioneFv(draft, ENERGY_CATALOG)).toEqual([]);
    const native = righeComponentiFv(draft, ENERGY_CATALOG);
    expect(native.filter((r) => r.categoria === "pannello")).toHaveLength(1);
    expect(native.find((r) => r.categoria === "pannello")?.quantita).toBe(14);
    expect(
      native
        .filter((r) => r.categoria === "altro" && r.unita_misura === "m")
        .map((r) => r.quantita),
    ).toEqual([18, 22, 8]);
    expect(draft.con_wallbox).toBe(true);
    expect(() =>
      applyEnergyFvImport(
        draft,
        d,
        "company1",
        ENERGY_CATALOG,
        selection,
        rows,
        prices,
      ),
    ).toThrow(/già stato importato/);
    expect(() =>
      applyEnergyFvImport(
        { ...INITIAL, prezzo_vendita_manuale: 12000 },
        d,
        "company1",
        ENERGY_CATALOG,
        selection,
        rows,
        prices,
      ),
    ).toThrow(/prezzo manuale/);
  });
  it("ricostruisce il collegamento soltanto da un ID, mai da URL o token", () => {
    const id = "642c7795-a27d-47bc-87a4-c5e57f590dd7";
    expect(energySurveyOrigin(`Manuale [rilievo:${id}]`)).toBe(id);
    expect(energySurveyOrigin(`rilievo:${id}:element`)).toBe(id);
    expect(
      energySurveyOrigin("https://example.invalid/?token=private"),
    ).toBeUndefined();
  });
  it("apre i modelli giusti e non vende un impianto completo quando si chiede soltanto un accumulo", () => {
    const d = makeEnergySurvey();
    d.survey.header_data.en_scenario = "accumulo";
    expect(energyQuoteHref(d)).toContain("modello=accumulo");
    expect(() =>
      energyFvPatch(d, "company1", ENERGY_CATALOG, selection),
    ).toThrow(/modello dedicato/);
    expect(energyQuoteHref(makeEnergySurvey("clima"))).toContain(
      "modello=multisplit",
    );
  });
  it.each(ENERGY_SCENARIOS)(
    "%s conserva tutti gli elementi e controlla le quantità",
    (scenario) => {
      const d = makeEnergySurvey(scenario),
        restored = JSON.parse(JSON.stringify(d));
      expect(restored.elements.length).toBe(
        scenario === "fotovoltaico" ? 10 : scenario === "clima" ? 6 : 5,
      );
      expect(restored.survey.client_signature_at).toBeNull();
      for (const e of restored.elements) {
        const type = d.template.schema.element_types.find(
          (t) => t.key === e.element_type,
        )!;
        expect(() => validateEnergyValues(type, e.values)).not.toThrow();
        expect(energyIssues(type, e.values)).toEqual([]);
        expect(energyGeometryIssues(type, e.values)).toEqual([]);
        expect(energyScene(type, e.values).width).toBeGreaterThan(0);
      }
      expect(energyQuoteRows(d, "company1").length).toBe(
        d.elements.length - (scenario === "fotovoltaico" ? 1 : 0),
      );
    },
  );
  it.each(ENERGY_SCENARIOS)(
    "%s mantiene ogni campo in un solo passo mobile",
    (scenario) => {
      const d = makeEnergySurvey(scenario);
      for (const t of d.template.schema.element_types) {
        const original = t.sections.flatMap((s) => s.fields.map((f) => f.key));
        const partition = [0, 1, 2, 3].flatMap((step) =>
          sectionsForSurveyStep(t.sections, step).flatMap((s) =>
            s.fields.map((f) => f.key),
          ),
        );
        expect(partition.sort()).toEqual(original.sort());
        expect(new Set(partition).size).toBe(partition.length);
      }
    },
  );
  it("estende senza cambiare campi aziendali e senza duplicare a ogni caricamento", () => {
    const d = makeEnergySurvey();
    const t = d.template.schema.element_types[0];
    t.sections[0].fields[0].label = "Campo aziendale";
    const source = JSON.stringify(d.template);
    const enriched = withEnergySurveyProducts(d.template);
    expect(JSON.stringify(d.template)).toBe(source);
    expect(withEnergySurveyProducts(enriched)).toEqual(enriched);
    expect(enriched.schema.element_types[0].sections[0].fields[0].label).toBe(
      "Campo aziendale",
    );
  });
  it("rifiuta quantità NaN, decimali, coordinate malformate e griglie eccessive", () => {
    const d = makeEnergySurvey(),
      e = d.elements[0],
      t = d.template.schema.element_types[0];
    for (const count of [NaN, Infinity, -1, 1.5, 201])
      expect(() =>
        validateEnergyValues(t, { ...e.values, en_count: count }),
      ).toThrow();
    expect(() =>
      validateEnergyValues(t, {
        ...e.values,
        en_obstacles: [{ x: NaN, y: 0, w: 1, h: 1 }],
      }),
    ).toThrow();
    expect(() =>
      proposeEnergyLayout({
        ...e.values,
        en_width: 100000,
        en_height: 100000,
        en_module_width: 1,
        en_module_height: 1,
        en_margin: 0,
        en_gap: 0,
      }),
    ).toThrow();
  });
  it("non converte automaticamente una proiezione orizzontale in superficie utile", () => {
    const e = makeEnergySurvey().elements[0];
    expect(() =>
      proposeEnergyLayout({ ...e.values, en_plane: "orizzontale" }),
    ).toThrow(/piano della falda/);
  });
  it("non riduce la quantità richiesta se il tetto è troppo piccolo", () => {
    const e = makeEnergySurvey().elements[0];
    expect(() =>
      proposeEnergyLayout({ ...e.values, en_width: 1, en_height: 1 }),
    ).toThrow();
    expect(e.values.en_count).toBe(7);
  });
  it("individua sovrapposizioni, ostacoli, bordo e misure moduli cambiate", () => {
    const d = makeEnergySurvey(),
      e = d.elements[0],
      t = d.template.schema.element_types[0],
      layout = structuredClone(e.values.en_layout) as Array<
        Record<string, unknown>
      >;
    layout[1] = { ...layout[0] };
    let issues = energyGeometryIssues(t, { ...e.values, en_layout: layout });
    expect(issues.join()).toMatch(/sovrapposti/);
    issues = energyGeometryIssues(t, {
      ...e.values,
      en_obstacles: [{ x: 0.4, y: 0.4, w: 1, h: 1 }],
    });
    expect(issues.join()).toMatch(/ostacolo/);
    expect(
      energyGeometryIssues(t, { ...e.values, en_width: 2 }).join(),
    ).toMatch(/fuori|bordo/);
    expect(
      energyGeometryIssues(t, { ...e.values, en_module_width: 1200 }).join(),
    ).toMatch(/non aggiornate/);
  });
  it("confronta solo i minimi del manuale inseriti, non inventa distanze", () => {
    const d = makeEnergySurvey("pdc"),
      e = d.elements[0],
      t = d.template.schema.element_types.find(
        (t) => t.key === e.element_type,
      )!;
    expect(energyIssues(t, { ...e.values, en_free_front: 100 }).join()).toMatch(
      /minimo/,
    );
    const v = { ...e.values };
    delete v.en_min_front;
    expect(energyIssues(t, { ...v, en_free_front: 100 }).join()).not.toMatch(
      /minimo/,
    );
    expect(energyIssues(t, { ...v, en_load_reference: "" }).join()).toMatch(
      /termotecnico/,
    );
  });
  it("controlla esplicitamente la compatibilità ibrida senza dimensionare dai mq", () => {
    const d = makeEnergySurvey("ibrido"),
      e = d.elements[0],
      t = d.template.schema.element_types.find(
        (t) => t.key === e.element_type,
      )!;
    expect(energyIssues(t, { ...e.values, en_hybrid_kit: "" }).join()).toMatch(
      /Compatibilità/,
    );
  });
  it("sceglie il preventivatore corretto e non perde il modello PDC / ibrido", () => {
    expect(energyQuoteHref(makeEnergySurvey())).toContain(
      "/marketing/fotovoltaico/nuovo?",
    );
    expect(energyQuoteModule(makeEnergySurvey("clima"))).toBe(
      "climatizzazione",
    );
    expect(energyQuoteHref(makeEnergySurvey("pdc"))).toContain(
      "modello=pompa-calore",
    );
    expect(energyQuoteHref(makeEnergySurvey("ibrido"))).toContain(
      "modello=ibrido",
    );
  });
  it("nega la lettura per azienda errata e non trasforma gli esistenti in forniture", () => {
    const d = makeEnergySurvey();
    expect(() => energyQuoteRows(d, "other")).toThrow(/azienda/);
    expect(energyQuoteRows(d, "company1").some((r) => r.kind === "meter")).toBe(
      false,
    );
  });
  it("FV: importa 14 moduli da 450 W, senza falda finta né doppioni dei principali", () => {
    const patch = energyFvPatch(
      makeEnergySurvey(),
      "company1",
      ENERGY_CATALOG,
      selection,
    );
    expect(patch.numero_pannelli_scelti).toBe(14);
    expect(patch.potenza_kwp).toBe(6.3);
    expect(patch.layout_overlay).toBeNull();
    expect(patch.prodotti_extra).toBeUndefined();
    expect(patch.capacita_accumulo_kwh).toBe(10);
  });
  it("FV: blocca catalogo, potenza, capacità o quantità non coerenti", () => {
    const d = makeEnergySurvey();
    expect(() =>
      energyFvPatch(d, "company1", ENERGY_CATALOG, {
        ...selection,
        panelId: "missing",
      }),
    ).toThrow(/catalogo/);
    expect(() =>
      energyFvPatch(
        d,
        "company1",
        {
          ...ENERGY_CATALOG,
          pannelli: [{ ...ENERGY_CATALOG.pannelli[0], potenza_w: 460 }],
        },
        selection,
      ),
    ).toThrow(/potenza/);
    expect(() =>
      energyFvPatch(
        d,
        "company1",
        {
          ...ENERGY_CATALOG,
          accumuli: [{ ...ENERGY_CATALOG.accumuli[0], capacita_kwh: 5 }],
        },
        selection,
      ),
    ).toThrow(/Capacità/);
    d.elements.find((e) => e.element_type === "inverter")!.values.en_count = 2;
    expect(() =>
      energyFvPatch(d, "company1", ENERGY_CATALOG, selection),
    ).toThrow(/inverter/);
  });
  it.each(["clima", "pdc", "ibrido"] as const)(
    "%s: voci editabili, prezzi espliciti e blocco duplicati",
    (scenario) => {
      const rows = energyQuoteRows(makeEnergySurvey(scenario), "company1"),
        prices = Object.fromEntries(rows.map((r) => [r.key, "125,50"]));
      const computo = energyComputoRows(
        rows,
        prices,
        "company1",
        "project",
        [],
      );
      expect(computo).toHaveLength(rows.length);
      expect(computo[0].prezzo_unitario).toBe(125.5);
      expect(computo[0].fonte).toBe(rows[0].key);
      expect(() =>
        energyComputoRows(rows, prices, "company1", "project", computo),
      ).toThrow(/già presente/);
      expect(() =>
        energyComputoRows(rows, {}, "company1", "project", []),
      ).toThrow(/prezzo/);
      expect(() =>
        energyComputoRows(
          [{ ...rows[0], checks: ["Da verificare"] }],
          prices,
          "company1",
          "project",
          [],
        ),
      ).toThrow(/verifiche/);
    },
  );
  it("la copia non trasferisce approvazioni, documenti di verifica e geometrie di sito", () => {
    const d = makeEnergySurvey(),
      t = d.template.schema.element_types[0],
      copy = copySurveyValues(t, d.elements[0].values, "all");
    expect(copy.en_layout).toBeUndefined();
    expect(copy.en_obstacles).toBeUndefined();
    expect(copy.en_technical_check).not.toBe("documentata");
    expect(copy.en_check_reference).toBeUndefined();
  });
  it.each(ENERGY_SCENARIOS)(
    "%s: PDF nativo con brand e allegato dimostrativo",
    async (scenario) => {
      const d = makeEnergySurvey(scenario);
      const image = await sharp(
        Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="400"><rect width="900" height="400" fill="#eff6ff"/><rect x="70" y="70" width="250" height="180" rx="12" fill="#244b76"/><path d="M80 160H310M195 80V240" stroke="white" stroke-width="3"/><text x="360" y="130" fill="#193b63" font-family="sans-serif" font-size="30">ENERGIA · DEMO</text><text x="360" y="190" fill="#193b63" font-family="sans-serif" font-size="20">Allegato sintetico di simulazione</text><text x="70" y="330" fill="#92400e" font-family="sans-serif" font-size="22">Non è una foto reale o una verifica di cantiere</text></svg>`,
        ),
      )
        .removeAlpha()
        .png()
        .toBuffer();
      const url = `data:image/png;base64,${image.toString("base64")}`;
      if (process.env.ENERGY_SURVEY_PDF_QA === "1") {
        await mkdir("output/pdf/energy-qa", { recursive: true });
        await writeFile("output/pdf/energy-qa/allegato-sintetico.png", image);
      }
      d.media = [
        surveyMedia({
          id: `sim-photo-${scenario}`,
          survey_id: d.survey.id,
          element_id: d.elements[0].id,
          area_id: d.areas[0].id,
          url,
          filename: "Allegato sintetico.png",
          checklist_key: "en_context",
          checklist_label:
            "SIMULAZIONE · immagine sintetica, non foto del cantiere",
        }),
      ];
      expect(buildSurveyReport(d).missingPhotos).toBeGreaterThan(0);
      const blob = await renderSurveyPdf(
        d,
        "Energia Demo · SIMULAZIONE",
        {
          reference: "Cliente fittizio · nessun destinatario reale",
          assignees: ["Tecnico fittizio · SIMULAZIONE"],
        },
        {
          companyId: "company1",
          logoUrl: url,
          address: "Sede dimostrativa, nessuna azienda reale",
        },
      );
      const bytes = new Uint8Array(await blob.arrayBuffer());
      expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
      if (process.env.ENERGY_SURVEY_PDF_QA === "1") {
        await mkdir("output/pdf", { recursive: true });
        await writeFile(
          `output/pdf/Sopralluogo-${scenario}-SIMULAZIONE.pdf`,
          bytes,
        );
      }
    },
    60000,
  );
});
