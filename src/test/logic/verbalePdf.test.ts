/** Il PDF del verbale: si disegna davvero e si leggono le chiamate a drawText. */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("https://esm.sh/pdf-lib@1.17.1", async () => await import("pdf-lib"));

import { PDFPage, type PDFPageDrawTextOptions } from "pdf-lib";
import sharp from "sharp";
import { emptyAcceptance } from "../../../supabase/functions/collaudo-commessa/model";

const PERCORSO = "../../../supabase/functions/collaudo-commessa/render";
const { renderAcceptance } = await import(/* @vite-ignore */ PERCORSO);
const vero = PDFPage.prototype.drawText;
let FIRMA: Uint8Array;
beforeAll(async () => { FIRMA = new Uint8Array(await sharp({ create: { width: 60, height: 20, channels: 3, background: "#1d3557" } }).png().toBuffer()); });
afterEach(() => vi.restoreAllMocks());

const contesto = { company: "Azienda", order: "O-1", address: "Via Roma", id: "abc", version: 1 };
const disegna = async (contenuto: object, firma?: object) => {
  const testi: string[] = [];
  vi.spyOn(PDFPage.prototype, "drawText").mockImplementation(function (this: PDFPage, t: string, o?: PDFPageDrawTextOptions) { testi.push(t); vero.call(this, t, o); });
  const r = await renderAcceptance({ ...emptyAcceptance("2026-11-02"), ...contenuto }, contesto, firma);
  return { testo: testi.join(" "), testi, r };
};
const valori = [
  { chiave: "a", etichetta: "Pezzi controllati", tipo: "number", valore: 9, stampa: "cliente" },
  { chiave: "b", etichetta: "Nota interna", tipo: "text", valore: "riservato", stampa: "interno" },
];

describe("PDF del verbale", () => {
  it("senza firma resta com'è oggi", async () => {
    const { testo, testi } = await disegna({});
    expect(testo).toContain("EDIZIONE NON FIRMATA");
    expect(testo).toContain("non costituisce firma");
    expect(testi).not.toContain("Dati del collaudo");
    expect(testi.indexOf("03 / Esito e riserve")).toBeGreaterThan(-1);
  });
  it("firmato non dice più «non firmata» e riporta chi ha firmato", async () => {
    const { testo, r } = await disegna({}, { immagine: FIRMA, nome: "Mario Rossi", quando: "02/11/26, 10:00" });
    expect(testo).not.toContain("EDIZIONE NON FIRMATA");
    expect(testo).not.toContain("non costituisce firma");
    expect(testo).toContain("Firmato su schermo da Mario Rossi il 02/11/26, 10:00.");
    expect(testo).not.toMatch(/firma elettronica/i);
    expect(r.bytes.length).toBeGreaterThan(0);
  });
  it("i dati del collaudo stanno tra i controlli e l'esito, solo quelli per il cliente", async () => {
    const { testo, testi } = await disegna({ valori });
    const dati = testi.indexOf("Dati del collaudo");
    expect(dati).toBeGreaterThan(testi.indexOf("02 / Controlli effettuati"));
    expect(dati).toBeLessThan(testi.indexOf("03 / Esito e riserve"));
    expect(testo).toContain("Pezzi controllati: 9");
    expect(testo).not.toContain("riservato");
  });
  it("il titolo della firma sta sempre sulla stessa pagina della firma", async () => {
    for (let righe = 0; righe < 60; righe += 2) {
      vi.restoreAllMocks();
      let paginaTitolo = -1, paginaFirma = -1;
      vi.spyOn(PDFPage.prototype, "drawText").mockImplementation(function (this: PDFPage, t: string, o?: PDFPageDrawTextOptions) {
        if (t === "Firma del cliente") paginaTitolo = this.doc.getPages().indexOf(this);
        vero.call(this, t, o);
      });
      const immagineVera = PDFPage.prototype.drawImage;
      vi.spyOn(PDFPage.prototype, "drawImage").mockImplementation(function (this: PDFPage, i, o) {
        paginaFirma = this.doc.getPages().indexOf(this);
        immagineVera.call(this, i, o);
      });
      await renderAcceptance({ ...emptyAcceptance("2026-11-02"), notes: "riga\n".repeat(righe) + "x ".repeat(righe * 40) }, contesto, { immagine: FIRMA, nome: "M", quando: "oggi" });
      expect(paginaFirma, `con ${righe} righe`).toBe(paginaTitolo);
    }
  });
});

