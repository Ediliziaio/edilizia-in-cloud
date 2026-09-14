import { describe, expect, it } from "vitest";
import { haTrasparenza } from "@/lib/serramenti/pdfImageUtils";

// Il serramento scontornato del catalogo (webp con sfondo e vetri trasparenti),
// convertito in JPEG per il PDF, usciva su fondo nero: il canvas esporta il
// trasparente come nero. Con un pixel trasparente si esporta in PNG.
describe("immagini con parti trasparenti nel PDF", () => {
  it("riconosce un pixel trasparente, anche in fondo all'immagine", () => {
    expect(haTrasparenza([255, 255, 255, 255, 10, 20, 30, 255])).toBe(false);
    expect(haTrasparenza([255, 255, 255, 255, 0, 0, 0, 0])).toBe(true);
    expect(haTrasparenza(new Uint8ClampedArray([200, 200, 200, 254]))).toBe(true);
    expect(haTrasparenza([])).toBe(false);
  });
});
