import { describe, it, expect } from "vitest";
import { riconosciFile } from "@/lib/storage/fileRiservati";

describe("riconosciFile", () => {
  it("riconosce un indirizzo pubblico", () => {
    expect(riconosciFile("https://x.supabase.co/storage/v1/object/public/campo-rapportini/az/uuid/foto.jpg"))
      .toEqual({ bucket: "campo-rapportini", path: "az/uuid/foto.jpg" });
  });
  it("riconosce un link già firmato, ignorando il token", () => {
    expect(riconosciFile("https://x.supabase.co/storage/v1/object/sign/campo-firme/a/b.png?token=abc"))
      .toEqual({ bucket: "campo-firme", path: "a/b.png" });
  });
  it("riconosce un percorso nudo", () => {
    expect(riconosciFile("documenti-sub/az/durc.pdf")).toEqual({ bucket: "documenti-sub", path: "az/durc.pdf" });
  });
  it("lascia stare ciò che non è un file di storage", () => {
    expect(riconosciFile("https://esempio.it/foto.jpg")).toBeNull();
    expect(riconosciFile("")).toBeNull();
    expect(riconosciFile(null)).toBeNull();
  });
});
