import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CopertinaAnteprimaVista } from "@/components/preventivi/CopertinaAnteprima";

/** L'anteprima della copertina nell'editor segue la tipografia scelta, come il PDF. */
afterEach(cleanup);

const titoloDi = (font: string) => {
  render(
    <CopertinaAnteprimaVista
      modulo="ristrutturazione"
      form={{ font_family: font, pdf_cover_hero: "Il nuovo bagno" }}
      nomeAzienda="Edil Bianchi"
      logoUrl={null}
      kit={null}
    />,
  );
  return screen.getByText("Il nuovo bagno").closest("div") as HTMLElement;
};

describe("anteprima della copertina: la tipografia", () => {
  it("lineare: titoli senza grazie", () => {
    expect(titoloDi("lineare").style.fontFamily).toMatch(/Helvetica/);
  });

  it("editoriale: titoli con le grazie", () => {
    expect(titoloDi("editoriale").style.fontFamily).toMatch(/Times/);
  });
});
