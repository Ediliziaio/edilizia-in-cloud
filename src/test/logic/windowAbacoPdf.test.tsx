/// <reference types="node" />
import { expect, it } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { renderSurveyPdf } from "@/lib/surveys/reportPdf";
import { makeWindowSurveyDetail } from "../fixtures/windowSurvey";
it("PDF abaco finestra con dati esclusivamente dimostrativi", async () => {
  const detail = makeWindowSurveyDetail();
  detail.survey.code = "ESEMPIO-ABACO-FINESTRA";
  detail.survey.address = "Indirizzo dimostrativo";
  detail.survey.notes =
    "SIMULAZIONE LOCALE. Misure di esempio, non usare per ordini o produzione.";
  detail.elements = [
    {
      ...detail.elements[0],
      element_label: "Finestra a due ante - abaco dimostrativo",
      notes: "Quote rilevate distinte dalle misure finite per ordine.",
      values: {
        ...detail.elements[0].values,
        rv_measure_basis: "foro",
        rv_leaf_0_type: "battente",
        rv_leaf_0_side: "sx",
        rv_leaf_1_type: "anta_ribalta",
        rv_leaf_1_side: "dx",
        rv_abaco_counterframe: "nuovo",
        rv_abaco_counter_width: 1190,
        rv_abaco_counter_height: 1390,
        rv_abaco_window_width: 1170,
        rv_abaco_window_height: 1370,
        spessore_muro: 30,
        rv_abaco_frame_depth: 70,
        rv_abaco_swing: "interno",
        rv_abaco_reference:
          "Controtelaio nuovo; sezione del produttore da allegare. Posa e fissaggi da verificare sul posto.",
      },
    },
  ];
  const blob = await renderSurveyPdf(
    detail,
    "Azienda dimostrativa - simulazione",
  );
  const bytes = new Uint8Array(await blob.arrayBuffer());
  expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  if (process.env.WINDOW_ABACO_PDF_QA === "1") {
    await mkdir("output/pdf", { recursive: true });
    await writeFile("output/pdf/Esempio-abaco-tecnico-finestra.pdf", bytes);
  }
}, 20000);
