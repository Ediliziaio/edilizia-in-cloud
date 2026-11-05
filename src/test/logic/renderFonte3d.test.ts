import { describe, expect, it } from "vitest";
import { vincoloFonte3d } from "../../../shared/render-planimetria/fonte3d";

const nota = "La sorgente è una vista 3D del progetto: trasformala in una fotografia realistica. Infissi comuni del progetto: PVC, Bianco RAL 9010. Conserva le aperture.";
describe("render esterno dalla pianta", () => {
  it.each([{ notes: nota }, { note_libere: nota }, { technicalDetails: nota }, { legacy_config: { note_libere: nota } }])("legge la provenienza nei diversi moduli", (config) => {
    const brief = vincoloFonte3d(config);
    expect(brief).toContain("NOT a real photograph");
    expect(brief).toContain("PVC, Bianco RAL 9010");
    expect(brief).toContain("preserve each opening's geometry");
    expect(brief).toContain("never low-poly");
  });
  it("mantiene il normale trattamento conservativo delle fotografie", () => {
    expect(vincoloFonte3d({ notes: "Tinteggia in avorio la foto della casa" })).toBe("");
    expect(vincoloFonte3d(null)).toBe("");
  });
  it("non inventa un materiale comune quando non è stato scelto", () => {
    expect(vincoloFonte3d({ notes: "La sorgente è una vista 3D del progetto" })).not.toContain("AUTHORITATIVE WINDOW FINISH");
  });
});
