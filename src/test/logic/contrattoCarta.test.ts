import { describe, it, expect } from "vitest";
import {
  validaScansioneContratto,
  MAX_CONTRATTO_CARTA,
} from "@/lib/subappaltatori/contrattoCarta";
const file = (bytes: number[], size = bytes.length) =>
  ({
    size,
    slice: () => ({ arrayBuffer: async () => new Uint8Array(bytes).buffer }),
  }) as File;
describe("Scansione contratto cartaceo", () => {
  it("riconosce PDF, JPG e PNG dai contenuti, senza fidarsi dell’estensione", async () => {
    expect(await validaScansioneContratto(file([37, 80, 68, 70, 45, 49]))).toBe(
      "application/pdf",
    );
    expect(await validaScansioneContratto(file([255, 216, 255, 224]))).toBe(
      "image/jpeg",
    );
    expect(
      await validaScansioneContratto(file([137, 80, 78, 71, 13, 10, 26, 10])),
    ).toBe("image/png");
  });
  it("rifiuta file vuoti, troppo grandi o con contenuti diversi", async () => {
    await expect(validaScansioneContratto(file([]))).rejects.toThrow(
      "non vuoto",
    );
    await expect(
      validaScansioneContratto(
        file([37, 80, 68, 70, 45], MAX_CONTRATTO_CARTA + 1),
      ),
    ).rejects.toThrow("20 MB");
    await expect(
      validaScansioneContratto(file([60, 104, 116, 109, 108, 62])),
    ).rejects.toThrow("Formato non supportato");
  });
});
