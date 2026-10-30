import assert from "node:assert/strict";
import { esempioPdfPos } from "../../../src/test/fixtures/posEsempioPdf.ts";
import { generaPdfPos, VERSIONE_RENDERER_POS } from "./posPdf.ts";
import { fontsRiferimentoPos } from "./posGlifi.ts";
import { LAYOUT_POS_VERSIONE, VERSIONE_RENDERER_POS_BROWSER } from "./posRenderer.ts";

/**
 * Server e browser disegnano lo stesso PDF solo se hanno la stessa versione di layout, gli stessi font e gli stessi
 * controlli. Queste sono le tre cose che due copie dello stesso dato possono far divergere: se cambia l'una e non l'altra,
 * il test lo dice. (La versione del layout vive in posRenderer.ts, usato anche dal browser; posPdf.ts, che carica
 * pdfmake, ha la sua stringa: lasciarlo com'è evita di toccare un file che cambia spesso.)
 */
Deno.test("Coerenza: la versione di chi disegna sul server è il layout condiviso più pdfmake, e quella del browser lo dice", () => {
  assert.equal(VERSIONE_RENDERER_POS, `${LAYOUT_POS_VERSIONE}/pdfmake-0.3.9`);
  assert.equal(VERSIONE_RENDERER_POS_BROWSER, `${LAYOUT_POS_VERSIONE}-browser/pdfmake-0.3.9`);
});

Deno.test("Coerenza: i font elencati in preparazione sono quelli che il PDF del server dichiara, e hanno i byte che il client incorpora", async () => {
  // Gli stessi due valori sono verificati lato client in src/test/logic/posPdfBrowserMotore.test.ts contro il pdfmake del client.
  const attesi = [
    { nome: "Roboto-Regular.ttf", sha256: "ab9c18a75da1636435afd2398ffce325496644a8f258f918c92c4baf34a68625" },
    { nome: "Roboto-Medium.ttf", sha256: "4cb9d8a346d7d9190ef145daad9a85d58e2592043b199cdb8ed52ff535c64047" },
    // Il mini-font delle caselle (posFont.ts), registrato da server e Worker con registraFontPos.
    { nome: "PosCaselle.ttf", sha256: "869e16926b85a422fc3582187760805b10e13a83f0c85b3b43019827ab96a647" },
  ];
  assert.deepEqual(await fontsRiferimentoPos(), attesi);
  assert.deepEqual((await generaPdfPos(esempioPdfPos(), "2026-10-26T12:00:00Z")).fonts, attesi);
});
