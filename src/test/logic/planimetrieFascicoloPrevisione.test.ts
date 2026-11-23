/**
 * Il fascicolo di una variante: con le fonti dei prezzi porta lavorazioni quotate, totale e
 * la pagina «Previsione dei lavori»; senza (chi non vede gli importi) non mostra un euro.
 */
import { Blob as NodeBlob } from "node:buffer";
import { webcrypto } from "node:crypto";
import fs from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { piantaCollaudoConVariante } from "../fixtures/piantaCollaudo";

const pixel = () => new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4d0AAAAASUVORK5CYII=", "base64"));
vi.mock("@/components/planimetrie/tred/fotogramma", () => ({ catturaVistaProgetto: async () => new NodeBlob([pixel()], { type: "image/png" }) }));
vi.mock("@/lib/planimetrie/render/renderDallaPianta", () => ({ pngDaSvg: async () => new NodeBlob([pixel()], { type: "image/png" }) }));
import { esportaFascicolo, type DatiFascicolo } from "@/lib/planimetrie/fascicoloPdf";
import { FONTI_VUOTE } from "@/lib/planimetrie/prezziProposti";

const dati = (): DatiFascicolo => ({ documento: piantaCollaudoConVariante(), titolo: "Progetto di collaudo", versione: 1, ambito: "progetto:A", renders: [],
  cartiglio: { azienda: { nome: "Verifica locale" }, data: new Date("2026-11-23T12:00:00Z") } });
afterEach(() => vi.unstubAllGlobals());

it("con gli importi aggiunge la pagina della previsione; senza, il fascicolo è più corto", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const senza = await esportaFascicolo(dati());
  const con = await esportaFascicolo({ ...dati(), fontiPrezzi: FONTI_VUOTE });
  expect(con.pagine).toBeGreaterThan(senza.pagine);
  expect((await PDFDocument.load(con.dati)).getPageCount()).toBe(con.pagine);
  if (process.env.SALVA_PDF) fs.writeFileSync(process.env.SALVA_PDF, con.dati);
});
