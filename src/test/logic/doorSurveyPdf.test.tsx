/// <reference types="node" />
import { describe, it, expect } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { renderSurveyPdf } from "@/lib/surveys/reportPdf";
import { INTERNAL_DOOR_TYPE } from "@/lib/surveys/doorSurvey";
import { makeWindowSurveyDetail } from "../fixtures/windowSurvey";
describe("Esempi PDF porte e zanzariere", () => {
  it("genera il dossier con lo stesso motore vettoriale e dati esclusivamente simulati", async () => {
    const detail = makeWindowSurveyDetail();
    detail.template.schema.element_types.push(
      structuredClone(INTERNAL_DOOR_TYPE),
    );
    detail.survey.code = "ESEMPIO-PORTE-RETI";
    detail.survey.address = "Indirizzo dimostrativo";
    detail.survey.notes =
      "SIMULAZIONE LOCALE. Configurazioni e misure inventate solo per mostrare il funzionamento. Non usare per ordini o produzione.";
    const common = {
      rv_measure_basis: "foro",
      rv_door_counterframe: "nuovo",
      rv_door_frame_state: "da_murare",
      rv_door_hinge: "sx",
      rv_door_swing: "spingere",
      rv_door_layout: "singola",
      colore_interno: "RAL 9010",
      colore_esterno: "RAL 7016",
    };
    const cases = [
      {
        type: "portoncino_blindato",
        label: "Blindato con due fiancoluce e sopraluce",
        values: {
          ...common,
          larghezza: 160,
          altezza: 250,
          tipologia: "1_anta",
          rv_door_sidelights: "entrambi",
          rv_door_sidelight_left_width: 300,
          rv_door_sidelight_right_width: 300,
          rv_door_toplight: "fisso",
          rv_door_toplight_height: 350,
          rv_door_panel_design: "orizzontale",
        },
      },
      {
        type: "portoncino_blindato",
        label: "Blindato due ante asimmetriche",
        values: {
          ...common,
          larghezza: 150,
          altezza: 230,
          tipologia: "2_ante",
          rv_door_layout: "doppia_asimmetrica",
          rv_door_split_mm: 1000,
          rv_door_active_side: "sx",
          rv_door_secondary: "semifissa",
          rv_door_counterframe: "riutilizzo",
          rv_door_frame_state: "murato",
        },
      },
      {
        type: "porta_interna",
        label: "Porta interna a battente - riferimento A e B",
        values: {
          ...common,
          larghezza: 800,
          altezza: 2100,
          tipologia: "battente",
          spessore_muro: 120,
          rv_door_side_a: "Corridoio",
          rv_door_side_b: "Camera",
          materiale: "laccato",
        },
      },
      {
        type: "porta_interna",
        label: "Porta interna scorrevole a scomparsa",
        values: {
          ...common,
          larghezza: 800,
          altezza: 2100,
          tipologia: "scorrevole_scomparsa",
          rv_door_side_a: "Disimpegno",
          rv_door_side_b: "Bagno",
          rv_door_slide_side: "dx",
        },
      },
      {
        type: "zanzariera_standalone",
        label: "Zanzariera verticale a molla",
        values: {
          larghezza: 100,
          altezza: 140,
          tipo: "avvolgibile_verticale",
          rv_zan_direction: "verticale",
          rv_zan_mechanism: "molla",
          rv_zan_bottom_rail: "si",
          rv_zan_side: "alto",
          rv_zan_model: "Modello dimostrativo - da scegliere",
          rv_measure_basis: "foro",
        },
      },
      {
        type: "zanzariera_standalone",
        label: "Zanzariera orizzontale plissettata doppia con cingolo",
        values: {
          larghezza: 160,
          altezza: 220,
          tipo: "plissettata",
          rv_zan_direction: "orizzontale",
          rv_zan_mechanism: "plisse",
          rv_zan_panels: "doppia",
          rv_zan_guide_system: "carrarmato",
          rv_zan_bottom_rail: "si",
          rv_measure_basis: "foro",
        },
      },
    ];
    detail.elements = cases.map((c, i) => ({
      ...detail.elements[0],
      id: `example-${i}`,
      element_type: c.type,
      element_label: c.label,
      values: c.values,
      position: i,
      notes: "ESEMPIO ILLUSTRATIVO - dati di prova, non validi per ordini.",
      quantity: 1,
    }));
    const blob = await renderSurveyPdf(
      detail,
      "Azienda dimostrativa - simulazione",
    );
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(15000);
    if (process.env.DOOR_SURVEY_PDF_QA === "1") {
      await mkdir("output/pdf", { recursive: true });
      await writeFile(
        "output/pdf/Esempi-rilievi-portoncini-porte-zanzariere.pdf",
        bytes,
      );
    }
  }, 20000);
});
