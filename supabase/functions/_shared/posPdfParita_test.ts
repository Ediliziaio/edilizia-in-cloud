// deno-lint-ignore-file no-import-prefix -- il bundle minificato del client non è nella mappa degli import della funzione: si importa a nome e versione, apposta
import assert from "node:assert/strict";
import pdfMakeServer from "pdfmake";
import vfsServer from "pdfmake-fonts";
import pdfMakeClient from "npm:pdfmake@0.3.9/build/pdfmake.min.js";
import vfsClient from "npm:pdfmake@0.3.9/build/vfs_fonts.js";
import { esempioPdfPos } from "../../../src/test/fixtures/posEsempioPdf.ts";
import { registraFontPos } from "./posFont.ts";
import { costruisciHtmlPos } from "./posHtml.ts";
import { disegnaPdfPos } from "./posPdfBrowser.ts";
import { generaPdfPos } from "./posPdf.ts";
import { sha256Hex } from "./improntaDocumento.ts";

/**
 * Il PDF che disegna il browser deve avere l'aspetto di quello che prima disegnava il server. Il client usa il bundle
 * minificato di pdfmake (circa 1 MB invece di 2,4), il server quello non minificato: qui si prova che, con lo stesso
 * layout e gli stessi font, disegnano gli stessi identici byte. Se un aggiornamento di pdfmake li facesse divergere,
 * questo test lo dice prima che lo scopra un utente.
 */
pdfMakeServer.addVirtualFileSystem(vfsServer);
// deno-lint-ignore no-explicit-any
(pdfMakeClient as any).addVirtualFileSystem(vfsClient);
// Come il Worker del browser: il mini-font delle caselle (posFont.ts).
// deno-lint-ignore no-explicit-any
registraFontPos(pdfMakeClient as any);

Deno.test("Parità: il bundle minificato del client disegna gli stessi byte del server, senza legame", async () => {
  const dati = esempioPdfPos();
  const emessoIl = "2026-10-26T12:00:00Z";
  const dalServer = (await generaPdfPos(dati, emessoIl)).bytes;
  const base = { html: costruisciHtmlPos({ ...dati, emessoIl }), codice: dati.codiceCommessa || "Commessa", revisione: dati.revisione, emessoIl, anteprima: false };
  // deno-lint-ignore no-explicit-any
  const dalClient = await disegnaPdfPos(pdfMakeClient as any, base);
  assert.equal(await sha256Hex(dalClient), await sha256Hex(dalServer));
  // Controllo di sensibilità: un input diverso (l'anteprima ha la filigrana) dà un PDF diverso, quindi il confronto sopra distingue.
  // deno-lint-ignore no-explicit-any
  const anteprima = await disegnaPdfPos(pdfMakeClient as any, { ...base, anteprima: true });
  assert.notEqual(await sha256Hex(anteprima), await sha256Hex(dalServer));
});
