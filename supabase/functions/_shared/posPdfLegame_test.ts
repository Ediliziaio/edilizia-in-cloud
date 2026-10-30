import assert from "node:assert/strict";
import pdfMake from "pdfmake";
import vfs from "pdfmake-fonts";
import { strToU8 } from "fflate";
import { esempioPdfPos } from "../../../src/test/fixtures/posEsempioPdf.ts";
import { costruisciHtmlPos } from "./posHtml.ts";
import { sha256Hex } from "./improntaDocumento.ts";
import { generaPdfPos } from "./posPdf.ts";
import { disegnaPdfPos } from "./posPdfBrowser.ts";
import { leggiLegamePdfPos } from "./posPdfLegame.ts";

pdfMake.addVirtualFileSystem(vfs);
const emissioneId = "33333333-3333-4333-8333-333333333333";
const emessoIl = "2026-10-26T12:00:00Z";
const html = costruisciHtmlPos(esempioPdfPos());
const htmlSha256 = await sha256Hex(strToU8(html));
const disegna = (legame?: { emissioneId: string; htmlSha256: string }) =>
  disegnaPdfPos(pdfMake, { html, codice: "TEST-POS-2026", revisione: 0, emessoIl, anteprima: false, legame });
const aggiungi = (pdf: Uint8Array, testo: string) => Uint8Array.from([...pdf, ...strToU8(testo)]);

Deno.test("Legame: il PDF disegnato dichiara l'emissione, l'impronta del modello HTML e la versione del layout", async () => {
  const pdf = await disegna({ emissioneId, htmlSha256 });
  assert.equal(new TextDecoder().decode(pdf.slice(0, 5)), "%PDF-");
  assert.deepEqual(leggiLegamePdfPos(pdf), { emissioneId, htmlSha256, layout: "pos-pdf-9-riferimento-psc" });
});

Deno.test("Legame: il PDF fatto dal server non dichiara nessun legame", async () => {
  const dalServer = await generaPdfPos(esempioPdfPos(), emessoIl);
  assert.equal(leggiLegamePdfPos(dalServer.bytes), null);
});

Deno.test("Legame: un valore scritto dopo la fine del file non prende il posto di quello vero", async () => {
  const falso = "\n<< /PosEmissione (99999999-9999-4999-8999-999999999999) /PosHtmlSha256 (" + "b".repeat(64) + ") >>\n";
  const vero = await disegna({ emissioneId, htmlSha256 });
  assert.deepEqual(leggiLegamePdfPos(aggiungi(vero, falso))?.emissioneId, emissioneId);
  const senza = (await generaPdfPos(esempioPdfPos(), emessoIl)).bytes;
  assert.equal(leggiLegamePdfPos(aggiungi(senza, falso)), null);
});

Deno.test("Legame: ciò che non è un PDF intero non lancia eccezioni e non dichiara nulla", async () => {
  const pdf = await disegna({ emissioneId, htmlSha256 });
  assert.equal(leggiLegamePdfPos(strToU8("non sono un PDF")), null);
  assert.equal(leggiLegamePdfPos(new Uint8Array()), null);
  assert.equal(leggiLegamePdfPos(pdf.slice(0, Math.floor(pdf.length / 2))), null);
});
