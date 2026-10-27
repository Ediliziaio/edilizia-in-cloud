import { describe, expect, it } from "vitest";
import { assegnaRuolo, controllaImmagineCatalogo, immaginePrincipale, immaginiPerPdf, leggiImmaginiCatalogo } from "@/lib/listino/immaginiCatalogo";

const immagini = () => [
  { id: "a", url: "https://example.test/a.jpg", ruolo: "principale" as const, didascalia: "Vista prodotto" },
  { id: "b", url: "https://example.test/b.jpg", ruolo: "sezione" as const, didascalia: "Profilo" },
  { id: "c", url: "https://example.test/c.jpg", ruolo: "esclusa" as const, didascalia: "Interna" },
];
describe("Immagini catalogo", () => {
  it("legge la foto precedente senza perderla", () => {
    expect(leggiImmaginiCatalogo(undefined, "https://example.test/vecchia.jpg")).toMatchObject([{ id: "legacy", ruolo: "principale" }]);
  });
  it("esclude le immagini interne e non reintroduce la vecchia principale", () => {
    const gallery = leggiImmaginiCatalogo(immagini().map(i => ({ ...i, ruolo: "esclusa" })), "https://example.test/vecchia.jpg");
    expect(immaginiPerPdf(gallery)).toEqual([]);
    expect(immaginePrincipale(gallery)).toBeNull();
  });
  it("cambia principale senza spostare o mutare le altre immagini", () => {
    const original = immagini();
    const next = assegnaRuolo(original, "b", "principale");
    expect(next.map(i => i.id)).toEqual(["a", "b", "c"]);
    expect(next.map(i => i.ruolo)).toEqual(["dettaglio", "principale", "esclusa"]);
    expect(original[0].ruolo).toBe("principale");
    expect(immaginePrincipale(next)?.id).toBe("b");
  });
  it("normalizza input malformati e principali duplicate", () => {
    expect(leggiImmaginiCatalogo([null, {}, { ...immagini()[0], ruolo: "toString" }])).toEqual([]);
    expect(leggiImmaginiCatalogo([immagini()[0], { ...immagini()[1], ruolo: "principale" }]).map(i => i.ruolo)).toEqual(["principale", "dettaglio"]);
    expect(immaginiPerPdf([immagini()[0], { ...immagini()[1], url: immagini()[0].url }])).toHaveLength(1);
  });
  it("rifiuta file vuoti, tipi non supportati e foto troppo grandi", () => {
    expect(controllaImmagineCatalogo(new File([], "a.jpg", { type: "image/jpeg" }))).toContain("vuoto");
    expect(controllaImmagineCatalogo(new File(["svg"], "a.svg", { type: "image/svg+xml" }))).not.toBeNull();
    expect(controllaImmagineCatalogo(new File([new Uint8Array(3 * 1024 * 1024 + 1)], "a.jpg", { type: "image/jpeg" }))).not.toBeNull();
    expect(controllaImmagineCatalogo(new File(["image"], "a.webp", { type: "image/webp" }))).toBeNull();
  });
});
