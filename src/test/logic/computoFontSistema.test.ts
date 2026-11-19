import { afterEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { FONT_DOCUMENTO } from "@/lib/computo/fontDocumento";
import { modelloComputoDiSerie, vesteDalModello, leggiModelloComputo } from "@/lib/computo/modelloComputo";
import { validaTtf } from "@/lib/computo/assetModello";
import { generaComputoPdf } from "@/lib/computo/esportaComputo";
import { bozzaVuota, voceVuota, vociDaBozza } from "@/lib/computo/editorNativo";

afterEach(() => vi.unstubAllGlobals());
describe("caratteri inclusi nell'app", () => {
  it("include TTF statici regolari e grassetti con licenza, senza chiamate a servizi font esterni", async () => {
    expect(FONT_DOCUMENTO).toHaveLength(9);
    for (const font of FONT_DOCUMENTO.filter(f => f.normale)) {
      for (const path of new Set([font.normale, font.grassetto].filter(Boolean))) {
        const bytes = await readFile(`public${path}`);
        expect(() => validaTtf(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)).not.toThrow();
      }
      expect(await readFile(`public/fonts/preventivi/${font.id}/OFL.txt`, "utf8")).toMatch(/SIL OPEN FONT LICENSE/i);
    }
  });
  it("incorpora due diversi caratteri del sistema nello stesso PDF", async () => {
    const richieste: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      expect(url).toMatch(/^\/fonts\/preventivi\/[a-z]+\/(Regular|Bold)\.ttf$/);
      richieste.push(url);
      const b = await readFile(`public${url}`);
      return { ok: true, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
    }));
    const m = { ...modelloComputoDiSerie(), fontFamiglia: "lato" as const, fontTitoli: "ptserif" as const };
    const b = { ...bozzaVuota(), voci: [{ ...voceVuota(), descrizione: "È una lavorazione con misure · quantità e prezzo €", quantita: "2", prezzo: "45" }] };
    const pdf = await generaComputoPdf(vociDaBozza(b), { titolo: "Preventivo con caratteri del sistema", azienda: "Impresa demo", veste: vesteDalModello(m) });
    expect(pdf.output()).toContain("/FontFile2");
    expect(pdf.output()).toContain("Lato");
    expect(pdf.output()).toContain("PTSerif");
    expect(richieste).toEqual(expect.arrayContaining(["/fonts/preventivi/lato/Regular.ttf", "/fonts/preventivi/lato/Bold.ttf", "/fonts/preventivi/ptserif/Regular.ttf", "/fonts/preventivi/ptserif/Bold.ttf"]));
  });
  it("riconosce il Garamond già presente e conserva altri caratteri dei vecchi modelli", () => {
    const m = { ...modelloComputoDiSerie(), fontFamiglia: "personalizzato", fontPersonalizzato: { nome: "EBGaramond-Regular", file: "azienda/font.ttf", grassetto: "" } };
    expect(leggiModelloComputo(m).fontFamiglia).toBe("garamond");
    expect(leggiModelloComputo({ ...m, fontPersonalizzato: { ...m.fontPersonalizzato, nome: "Carattere storico azienda" } }).fontFamiglia).toBe("personalizzato");
  });
});
