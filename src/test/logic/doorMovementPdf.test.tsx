/// <reference types="node" />
import { it, expect } from "vitest";
import { isValidElement, type ReactNode } from "react";
import { WindowSurveyPdf } from "@/lib/surveys/windowSurveyPdf";
import { mkdir, writeFile } from "node:fs/promises";
import { renderSurveyPdf } from "@/lib/surveys/reportPdf";
import { INTERNAL_DOOR_TYPE } from "@/lib/surveys/doorSurvey";
import { makeWindowSurveyDetail } from "../fixtures/windowSurvey";
import { DOOR_MOVEMENT_EXAMPLES } from "../fixtures/doorMovements";
it("nel PDF A/B seguono la pianta del movimento e non le etichette delle vecchie porte a battente", () => {
  const texts: string[] = [];
  function walk(node: ReactNode) {
    if (typeof node === "string") texts.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (isValidElement<{ children?: ReactNode }>(node))
      walk(node.props.children);
  }
  for (const e of DOOR_MOVEMENT_EXAMPLES.slice(0, 4)) {
    texts.length = 0;
    walk(WindowSurveyPdf({ type: INTERNAL_DOOR_TYPE, values: e.values }));
    expect(texts.filter((t) => /^LATO [AB]$/.test(t))).toEqual([
      "LATO B",
      "LATO A",
    ]);
    expect(texts.join(" ")).toContain(
      "Bianco di rappresentazione - colore da confermare",
    );
  }
});
it("genera il PDF nativo dei movimenti con dati soltanto simulati", async () => {
  const detail = makeWindowSurveyDetail();
  detail.template.schema.element_types.push(
    structuredClone(INTERNAL_DOOR_TYPE),
  );
  detail.survey.code = "ESEMPIO-PORTE-MOVIMENTI";
  detail.survey.address = "Indirizzo dimostrativo";
  detail.survey.notes =
    "SIMULAZIONE LOCALE. Misure e configurazioni inventate per illustrare il software, non per ordini o produzione.";
  const original = detail.elements[0];
  detail.elements = DOOR_MOVEMENT_EXAMPLES.map((e, i) => ({
    ...original,
    id: `door-movement-${i}`,
    element_type: "porta_interna",
    element_label: e.label,
    position: i,
    values: e.values,
    quantity: 1,
    notes:
      "Schema illustrativo: ferramenta, luci nette e compatibilità devono essere verificati con il produttore.",
  }));
  const blob = await renderSurveyPdf(
      detail,
      "Azienda dimostrativa - simulazione",
    ),
    bytes = new Uint8Array(await blob.arrayBuffer());
  expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  if (process.env.DOOR_MOVEMENT_PDF_QA === "1") {
    await mkdir("output/pdf", { recursive: true });
    await writeFile("output/pdf/Esempi-porte-scorrevoli-a-libro.pdf", bytes);
  }
}, 20000);
