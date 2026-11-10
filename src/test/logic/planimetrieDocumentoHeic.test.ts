import { beforeEach, describe, expect, it, vi } from "vitest";
import { eHeic, erroreDocumento, normalizzaDocumento, notaLetturaPianta, ritaglioPixel } from "@/lib/planimetrie/documentoImmagine";
const decoder = vi.hoisted(() => vi.fn());
vi.mock("heic-to/csp", () => ({ heicTo: decoder }));
beforeEach(() => vi.clearAllMocks());

describe("Foto Apple per la lettura delle planimetrie", () => {
  it.each([["bagno.HEIC", "image/heic"], ["bagno.heif", "image/heif"], ["bagno.HEIC", ""], ["bagno.heif", "application/octet-stream"]])("riconosce %s anche quando il browser omette il tipo", (name, type) => {
    expect(erroreDocumento({ name, type, size: 1000 })).toBeNull();
    expect(eHeic({ name, type })).toBe(true);
  });
  it("decodifica e conserva il nome, inviando un JPEG vero al flusso di preparazione", async () => {
    decoder.mockResolvedValue(new Blob(["jpeg decodificato"], { type: "image/jpeg" }));
    const file = new File(["heic"], "Bagno.HEIC", { type: "image/heic", lastModified: 1234 });
    const convertita = await normalizzaDocumento(file);
    expect(convertita).toMatchObject({ name: "Bagno.jpg", type: "image/jpeg", lastModified: 1234 });
    expect(decoder).toHaveBeenCalledWith({ blob: file, type: "image/jpeg", quality: 0.96 });
  });
  it("non carica il decoder per un JPEG e non maschera un file corrotto rinominandolo", async () => {
    const jpeg = new File(["jpeg"], "foto.jpg", { type: "image/jpeg" });
    expect(await normalizzaDocumento(jpeg)).toBe(jpeg);
    expect(decoder).not.toHaveBeenCalled();
    decoder.mockRejectedValue(new Error("decoder"));
    await expect(normalizzaDocumento(new File(["errore"], "foto.heic", { type: "image/heic" }))).rejects.toThrow(/Non riesco a leggere questa foto HEIC/);
  });
  it("rifiuta file vuoti e troppo grandi prima della conversione", async () => {
    expect(erroreDocumento({ type: "image/heic", size: 11 * 1024 * 1024 })).toMatch(/troppo grande/);
    await expect(normalizzaDocumento(new File([], "vuoto.heic", { type: "image/heic" }))).rejects.toThrow(/vuoto/);
    expect(decoder).not.toHaveBeenCalled();
  });
  it("rende il ritaglio indipendente dall'anteprima e lo limita all'immagine", () => {
    expect(ritaglioPixel(4000, 3000, { x: 10, y: 20, width: 70, height: 60 })).toEqual({ x: 400, y: 600, width: 2800, height: 1800 });
    expect(ritaglioPixel(100, 100, { x: 90, y: 80, width: 50, height: 40 })).toEqual({ x: 90, y: 80, width: 10, height: 20 });
  });
  it("specifica un solo bagno, conserva le note e distingue le quote degli impianti", () => {
    const nota = notaLetturaPianta("ambiente", "Bagno", "Leggi il foglio centrale", true);
    expect(nota).toContain("Un solo ambiente: Bagno");
    expect(nota).toContain("Leggi il foglio centrale");
    expect(nota).toContain("quote scarichi");
    expect(nota.length).toBeLessThanOrEqual(500);
  });
});
