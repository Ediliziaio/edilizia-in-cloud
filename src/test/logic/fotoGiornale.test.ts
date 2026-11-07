import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  BUCKET_FOTO_GIORNALE, comeLeggereFotoGiornale, indirizziFotoGiornale, percorsoFotoGiornale, urlSalvatoFotoGiornale,
} from "../../../supabase/functions/_shared/fotoGiornale";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

describe("foto del giornale nel bucket privato foto-cantiere", () => {
  it("il percorso parte da azienda e commessa, le cartelle che la policy di caricamento controlla", () => {
    expect(BUCKET_FOTO_GIORNALE).toBe("foto-cantiere");
    const p = percorsoFotoGiornale("az-1", "ord-2", "abc.jpg");
    expect(p).toBe("az-1/ord-2/giornale/abc.jpg");
    expect(p.split("/").slice(0, 2)).toEqual(["az-1", "ord-2"]);
  });

  it("in `url` si salva il percorso nudo, mai un URL pubblico", () => {
    expect(urlSalvatoFotoGiornale("az-1/ord-2/giornale/abc.jpg")).toBe("foto-cantiere/az-1/ord-2/giornale/abc.jpg");
    expect(urlSalvatoFotoGiornale("/az/o/giornale/x.jpg")).toBe("foto-cantiere/az/o/giornale/x.jpg");
  });

  it("legge dal percorso; ripiega sull'URL solo se è già http", () => {
    expect(comeLeggereFotoGiornale({ url: "foto-cantiere/a/b/giornale/x.jpg", storage_path: "a/b/giornale/x.jpg" })).toEqual({ tipo: "firma", path: "a/b/giornale/x.jpg" });
    expect(comeLeggereFotoGiornale({ url: "https://x.supabase.co/storage/v1/object/public/vecchio/f.jpg", storage_path: "f.jpg" })).toEqual({ tipo: "diretto", url: "https://x.supabase.co/storage/v1/object/public/vecchio/f.jpg" });
    expect(comeLeggereFotoGiornale({ url: "foto-cantiere/a/b/x.jpg", storage_path: null })).toEqual({ tipo: "firma", path: "a/b/x.jpg" });
    expect(comeLeggereFotoGiornale({ url: "", storage_path: "" })).toBeNull();
    expect(comeLeggereFotoGiornale({ url: "altro-bucket/x.jpg" })).toBeNull();
  });

  it("firma in blocco con una sola chiamata, nello stesso ordine; vuoto dove la firma non c'è", async () => {
    const firma = vi.fn(async (paths: string[]) => paths.map((p) => (p.includes("no") ? null : `https://firmato/${p}`)));
    const link = await indirizziFotoGiornale([
      { storage_path: "a/b/giornale/1.jpg" },
      { url: "https://vecchia/2.jpg", storage_path: "x" },
      { storage_path: "a/b/giornale/no.jpg" },
      { url: null, storage_path: null },
      { storage_path: "a/b/giornale/1.jpg" },
    ], firma);
    expect(firma).toHaveBeenCalledTimes(1);
    expect(firma.mock.calls[0][0]).toEqual(["a/b/giornale/1.jpg", "a/b/giornale/no.jpg"]);
    expect(link).toEqual(["https://firmato/a/b/giornale/1.jpg", "https://vecchia/2.jpg", "", "", "https://firmato/a/b/giornale/1.jpg"]);
  });

  it("se la firma fallisce non lancia: le foto restano vuote, l'URL http resta", async () => {
    const link = await indirizziFotoGiornale([{ storage_path: "a/x.jpg" }, { url: "https://v/1.jpg" }], async () => { throw new Error("rete"); });
    expect(link).toEqual(["", "https://v/1.jpg"]);
    const nessuna = vi.fn();
    expect(await indirizziFotoGiornale([], nessuna)).toEqual([]);
    expect(nessuna).not.toHaveBeenCalled();
  });

  it("nessun riferimento al bucket giornale-foto, che non esiste, nelle pagine e nell'edge", () => {
    for (const f of [
      "src/pages/azienda/GiornaleLavori.tsx",
      "supabase/functions/generate-giornale-pdf/index.ts",
      "src/components/cliente/FotoCantiereCliente.tsx",
    ]) expect(readFileSync(f, "utf8")).not.toMatch(/["'`]giornale-foto["'`]/);
    const pagina = readFileSync("src/pages/azienda/GiornaleLavori.tsx", "utf8");
    expect(pagina).toContain("percorsoFotoGiornale(");
    expect(pagina).not.toContain("getPublicUrl");
  });
});

describe("foto del giornale per il cliente esterno", () => {
  it("salta le foto dei bucket riservati (non le può leggere) e quelle senza URL", async () => {
    const { fotoLeggibileDalCliente } = await import("@/lib/campo/fotoGiornaleCliente");
    expect(fotoLeggibileDalCliente({ url: "foto-cantiere/a/b/giornale/x.jpg", storage_path: "a/b/giornale/x.jpg" })).toBe(false);
    expect(fotoLeggibileDalCliente({ url: "https://x.supabase.co/storage/v1/object/public/foto-cantiere/a.jpg" })).toBe(false);
    expect(fotoLeggibileDalCliente({ url: "", storage_path: "" })).toBe(false);
    expect(fotoLeggibileDalCliente({ url: "https://cdn.esempio.it/a.jpg" })).toBe(true);
  });
});
