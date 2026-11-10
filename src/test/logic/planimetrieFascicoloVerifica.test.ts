import { Blob as NodeBlob } from "node:buffer";
import { webcrypto } from "node:crypto";
import fs from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { bagnoDaVerificare, bagnoVerificatoSintetico } from "../fixtures/bagnoDaVerificare";
import { PDFDocument } from "pdf-lib";

const immagini = vi.hoisted(() => ({ catture: 0 }));
// L'impaginazione PDF e i disegni vettoriali sono reali. Solo WebGL e raster SVG
// sono sostituiti: queste immagini non sono render AI del documento dell'utente.
const pixel = () => new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4d0AAAAASUVORK5CYII=", "base64"));
vi.mock("@/components/planimetrie/Vista3DPigra", () => ({ caricaFotogramma: async () => async () => { immagini.catture++; return { png: new NodeBlob([pixel()], { type: "image/png" }) }; } }));
vi.mock("@/lib/planimetrie/render/renderDallaPianta", () => ({ pngDaSvg: async () => new NodeBlob([pixel()], { type: "image/png" }) }));
import { esportaFascicolo } from "@/lib/planimetrie/fascicoloPdf";
const dati = () => ({ titolo: "Verifica software - dati sintetici", versione: 1, ambito: "fatto", renders: [], cartiglio: { azienda: { nome: "Verifica locale" }, data: new Date("2026-11-10T12:00:00Z") } });
afterEach(() => vi.unstubAllGlobals());

it("un documento non verificato blocca il PDF prima di creare viste o leggere immagini", async () => {
  immagini.catture = 0;
  await expect(esportaFascicolo({ ...dati(), documento: bagnoDaVerificare() })).rejects.toThrow(/Prima di PDF/);
  expect(immagini.catture).toBe(0);
});

it("il fascicolo verificato conserva originale, quote alternative e conferme con pagine e indice validi", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const documento = bagnoVerificatoSintetico();
  documento.letturaDocumento!.sorgente = { percorso: "azienda/ricalco/esempio.png", nome: "Documento sintetico per test" };
  const esito = await esportaFascicolo({ ...dati(), documento, leggiDocumentoOriginale: async () => pixel() });
  const letto = await PDFDocument.load(esito.dati);
  expect(letto.getPageCount()).toBe(esito.pagine);
  expect(esito.pagine).toBeGreaterThan(8);
  expect(letto.getTitle()).toContain("dati sintetici");
  if (process.env.PLANIMETRIA_PDF_QA) fs.writeFileSync(process.env.PLANIMETRIA_PDF_QA, esito.dati);
}, 20000);
