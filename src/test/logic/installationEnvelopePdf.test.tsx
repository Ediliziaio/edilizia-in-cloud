/// <reference types="node" />
import { it, expect } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { renderSurveyPdf } from "@/lib/surveys/reportPdf";
import { makeWindowSurveyDetail } from "../fixtures/windowSurvey";
import { ENVELOPE_EXAMPLES } from "../fixtures/installationEnvelopes";
it("genera il PDF nativo con ingombri di blindati, tapparelle e varianti zanzariere", async () => {
  const detail = makeWindowSurveyDetail(),
    original = detail.elements[0];
  detail.survey.code = "ESEMPIO-INGOMBRI-POSA";
  detail.survey.address = "Indirizzo dimostrativo";
  detail.survey.header_data = {};
  detail.survey.notes =
    "SIMULAZIONE LOCALE. Misure inventate per provare il software; nessun prodotto reale o compatibilità certificata. Non usare per ordini o produzione.";
  detail.elements = ENVELOPE_EXAMPLES.map((e, index) => ({
    ...original,
    id: `envelope-${index}`,
    element_type: e.type,
    element_label: e.label,
    position: index,
    quantity: 1,
    values: e.values,
    notes:
      "Quote sintetiche. Nessun controllo di compatibilità sostituisce la scheda del produttore.",
  }));
  const blob = await renderSurveyPdf(
    detail,
    "Azienda dimostrativa - simulazione",
  );
  const bytes = new Uint8Array(await blob.arrayBuffer());
  expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  if (process.env.INSTALLATION_PDF_QA === "1") {
    await mkdir("output/pdf", { recursive: true });
    await writeFile("output/pdf/Esempi-spessori-ingombri-posa.pdf", bytes);
  }
}, 20000);
