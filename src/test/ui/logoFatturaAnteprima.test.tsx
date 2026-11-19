import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { PreviewFattura } from "@/components/fatturazione/PreviewFattura";
import type { EditorState } from "@/pages/azienda/fatturazione/editor/useEditorState";
import type { AnagraficaAzienda } from "@/types/fatturazione";
import { documentoHtml } from "../../../supabase/functions/generate-native-pdf/documentoHtml";
afterEach(cleanup);
it.each(["sinistra", "centro", "destra"] as const)("l'anteprima e il PDF condividono le impostazioni del logo a %s", posizione => {
  const doc = { tipo: "fattura", numero: "FT1", data_emissione: "2026-11-19", righe: [] as Record<string, unknown>[], riepilogo_iva: [] as Record<string, unknown>[], cliente_snapshot: {} };
  const az = { ragione_sociale: "Impresa Demo", partita_iva: "01234567897", pdf_logo: { posizione, dimensione: 150, spazioSopra: 8 } };
  const logo = "https://esempio.test/logo.png";
  const { container } = render(<PreviewFattura documento={doc as unknown as EditorState} azienda={az as unknown as AnagraficaAzienda} logoAziendale={logo} />);
  const img = container.querySelector(".fd-logo");
  expect(img?.getAttribute("src")).toBe(logo);
  expect(container.querySelectorAll(".fd-logo")).toHaveLength(1);
  expect(!!img?.closest(".fd-logo-riga")).toBe(posizione !== "sinistra");
  expect(container.querySelector("style")?.textContent).toContain("height: 33mm");
  expect(documentoHtml(doc, { ...az, logo_url: logo })).toContain("height: 33mm");
});
