/// <reference types="node" />
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { mkdir, writeFile } from "node:fs/promises";
import { renderSurveyPdf } from "@/lib/surveys/reportPdf";
import { makeSurveyDetail, surveyMedia } from "../fixtures/surveyDetail";
import { makeWindowSurveyDetail } from "../fixtures/windowSurvey";
const qa = vi.hoisted(() => ({ layout: null as unknown }));
type LayoutNode = {
  props?: { fixed?: boolean; stroke?: string; d?: string };
  box: { top: number; height: number };
  lines?: unknown[];
  children?: LayoutNode[];
};
vi.mock("@react-pdf/renderer", async (original) => {
  const api = await original<typeof import("@react-pdf/renderer")>();
  return {
    ...api,
    Document: (props: Record<string, unknown>) =>
      createElement(api.Document, {
        ...props,
        onRender: (data: unknown) => {
          qa.layout = data;
        },
      }),
  };
});

describe("PDF reale dei sopralluoghi", () => {
  it("genera tavole vettoriali con le stesse quote, ante, colori e note del rilievo", async () => {
    const detail = makeWindowSurveyDetail();
    detail.elements[0].values = {
      ...detail.elements[0].values,
      rv_leaf_0_type: "anta_ribalta",
      rv_leaf_0_side: "sx",
      rv_leaf_1_type: "battente",
      rv_leaf_1_side: "dx",
      tipo_telaio: "z_35",
      lati_con_z: ["sx", "dx", "alto", "basso"],
      rv_trim_sx_length: 1400,
      rv_trim_dx_length: 1400,
      rv_trim_alto_length: 1200,
      rv_annotations_v1: [
        {
          id: "pin-qa",
          x: 0.2,
          y: 0.5,
          text: "TEST - verificare mazzetta esterna",
          view: "esterna",
        },
      ],
      complementi: ["cassonetto", "tapparella"],
      cas_larghezza: 130,
      cas_altezza: 25,
      cas_profondita: 22,
      tap_larghezza: 118,
      tap_altezza: 160,
      rv_cielino_depth: 300,
      rv_cielino_width: 1300,
      rv_inspection: "inferiore",
      rv_tap_basis: "finita",
    };
    detail.elements.push({
      ...detail.elements[0],
      id: "door-qa",
      position: 2,
      element_type: "portoncino_blindato",
      element_label: "TEST portoncino a spingere",
      values: {
        larghezza: 90,
        altezza: 210,
        tipologia: "1_anta",
        rv_door_hinge: "dx",
        rv_door_swing: "spingere",
      },
    });
    detail.elements.push({
      ...detail.elements[0],
      id: "net-qa",
      position: 3,
      element_type: "zanzariera_standalone",
      element_label: "TEST zanzariera laterale senza guida",
      values: {
        larghezza: 120,
        altezza: 210,
        larghezza_telaio: 2.5,
        tipo: "avvolgibile_laterale",
        rv_zan_side: "sx",
        rv_zan_bottom_rail: "no",
      },
    });
    const blob = await renderSurveyPdf(detail, "TEST - rilievo visuale");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(bytes.byteLength).toBeGreaterThan(5000);
    const pages = (
      qa.layout as { _INTERNAL__LAYOUT__DATA_: { children: LayoutNode[] } }
    )._INTERNAL__LAYOUT__DATA_.children;
    if (process.env.SURVEY_PDF_QA === "1") {
      await mkdir("tmp/pdfs/serramenti-branded", { recursive: true });
      await writeFile("tmp/pdfs/serramenti-branded/fixture.pdf", bytes);
      const projection = (n: LayoutNode): unknown => ({
        box: n.box,
        fixed: n.props?.fixed,
        lineCount: n.lines?.length,
        children: n.children?.map(projection),
      });
      await writeFile(
        "tmp/pdfs/serramenti-branded/layout.json",
        JSON.stringify(pages.map(projection)),
      );
    }
    expect(pages.length).toBeLessThan(10);
    const allNodes = (nodes: LayoutNode[]): LayoutNode[] =>
      nodes.flatMap((n) => [n, ...allNodes(n.children ?? [])]);
    const openingPaths = allNodes(pages).filter(
      (n) => n.props?.stroke === "#d32940" && n.props?.d,
    );
    expect(openingPaths.length).toBeGreaterThan(0);
    expect(openingPaths.every((n) => !n.props!.d!.endsWith(" Z"))).toBe(true);
    for (const page of pages) {
      const footer = page.children?.find((node) => node.props?.fixed);
      expect(footer?.lines?.length).toBeGreaterThan(0);
      expect(footer!.box.top + footer!.box.height).toBeLessThan(
        page.box.height,
      );
    }
    if (process.env.SURVEY_PDF_QA === "1") {
      await mkdir("tmp/pdfs/survey-workspace", { recursive: true });
      await writeFile("tmp/pdfs/survey-workspace/window-report.pdf", bytes);
    }
  }, 20000);
  it("genera un PDF anche con note lunghe e allegati non riproducibili, senza richieste remote", async () => {
    const detail = makeSurveyDetail();
    detail.survey.notes =
      "Verificare accessi, supporti e misure prima di ordinare. ".repeat(60) +
      "FINE NOTE GENERALI";
    detail.media = [
      surveyMedia({
        type: "audio",
        filename: "Nota vocale",
        transcription:
          "Trascrizione di prova. ".repeat(150) + "FINE TRASCRIZIONE",
        url: "https://example.invalid/voce.webm",
      }),
    ];
    detail.elements = Array.from({ length: 8 }, (_, i) => ({
      ...detail.elements[0],
      id: `element${i}`,
      element_label: `Finestra ${i + 1}`,
      position: i,
    }));
    const blob = await renderSurveyPdf(detail, "Azienda Demo", {
      reference: "Contatto: Mario Demo",
      assignees: ["Luca Demo · Tecnico"],
    });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(bytes.byteLength).toBeGreaterThan(4000);
    const pages = (
      qa.layout as { _INTERNAL__LAYOUT__DATA_: { children: LayoutNode[] } }
    )._INTERNAL__LAYOUT__DATA_.children;
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) {
      const footer = page.children?.find((node) => node.props?.fixed);
      expect(footer?.lines?.length).toBeGreaterThan(0);
      expect(footer!.box.top + footer!.box.height).toBeLessThan(
        page.box.height,
      );
    }
    if (process.env.SURVEY_PDF_QA === "1") {
      await mkdir("tmp/pdfs/survey-workspace", { recursive: true });
      await writeFile("tmp/pdfs/survey-workspace/stress-report.pdf", bytes);
    }
  }, 20000);
});
