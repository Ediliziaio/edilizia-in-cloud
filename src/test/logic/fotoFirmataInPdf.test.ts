import { describe, expect, it } from "vitest";
import { eUnaFoto, misuraPagina, nomePdfDellaFoto } from "@/lib/orders/fotoFirmataInPdf";

const file = (nome: string, tipo: string) => new File(["x"], nome, { type: tipo });

describe("La copia firmata fotografata col telefono", () => {
  it("riconosce le foto, anche quelle dell'iPhone, e lascia stare i PDF", () => {
    expect(eUnaFoto(file("IMG_0421.HEIC", ""))).toBe(true);
    expect(eUnaFoto(file("scansione.jpg", "image/jpeg"))).toBe(true);
    expect(eUnaFoto(file("foto.png", "image/png"))).toBe(true);
    expect(eUnaFoto(file("contratto.pdf", "application/pdf"))).toBe(false);
  });

  it("il nome finisce sempre in .pdf, come vuole il server", () => {
    expect(nomePdfDellaFoto("IMG_0421.HEIC")).toBe("IMG_0421.pdf");
    expect(nomePdfDellaFoto("  ")).toBe("copia-firmata.pdf");
  });

  it("una foto da 12 megapixel si rimpicciolisce tenendo le proporzioni", () => {
    expect(misuraPagina(4032, 3024)).toEqual({ w: 2400, h: 1800 });
    expect(misuraPagina(3024, 4032)).toEqual({ w: 1800, h: 2400 });
  });

  it("una foto piccola resta com'è", () => {
    expect(misuraPagina(800, 600)).toEqual({ w: 800, h: 600 });
  });
});
