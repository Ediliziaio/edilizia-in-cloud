/** Piano campo completo 2.4 (26/11/2026): il codice del tesserino si legge dal QR (indirizzo con «#» o codice nudo). */
import { describe, expect, it } from "vitest";
import { codiceDaQr } from "@/pages/campo/CampoIngressi";

describe("codice del tesserino dal QR", () => {
  const codice = "4f2c8a1e-6b3d-4c2a-9e1f-0a1b2c3d4e5f";
  it("dall'indirizzo di verifica", () => expect(codiceDaQr(`https://app.ediliziaincloud.com/tesserino#${codice}`)).toBe(codice));
  it("dal codice nudo", () => expect(codiceDaQr(` ${codice} `)).toBe(codice));
  it("un QR qualunque no", () => {
    expect(codiceDaQr("https://example.com/qualcosa")).toBeNull();
    expect(codiceDaQr("MEZZO-123")).toBeNull();
  });
});
