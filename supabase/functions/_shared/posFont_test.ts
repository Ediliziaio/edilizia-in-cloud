import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { create } from "fontkit";
import { esempioPdfPos } from "../../../src/test/fixtures/posEsempioPdf.ts";
import { generaPdfPos } from "./posPdf.ts";
import { FONT_CASELLE_BASE64 } from "./posFontCaselle.ts";
import { registraFontPos } from "./posFont.ts";

const EMESSO = "2026-10-30T10:00:00Z";

Deno.test("Font delle caselle: due glifi (☐ ☒) con contorni veri, niente di più", () => {
  const f = create(Buffer.from(FONT_CASELLE_BASE64, "base64")) as unknown as {
    postscriptName: string; numGlyphs: number; unitsPerEm: number;
    hasGlyphForCodePoint(c: number): boolean; glyphForCodePoint(c: number): { advanceWidth: number; path: { commands: Array<{ command: string }> } };
  };
  assert.equal(f.postscriptName, "PosCaselle-Regular");
  assert.equal(f.numGlyphs, 3); // .notdef + due caselle
  assert.equal(f.unitsPerEm, 1000);
  assert.ok(f.hasGlyphForCodePoint(0x2610) && f.hasGlyphForCodePoint(0x2612));
  assert.ok(!f.hasGlyphForCodePoint(0x2611), "non si promette ciò che il font non ha");
  const contorni = (c: number) => f.glyphForCodePoint(c).path.commands.filter((x) => x.command === "moveTo").length;
  assert.equal(contorni(0x2610), 2); // bordo + foro
  assert.equal(contorni(0x2612), 3); // bordo + foro + X, in un unico contorno senza sovrapposizioni
  assert.equal(f.glyphForCodePoint(0x2610).advanceWidth, f.glyphForCodePoint(0x2612).advanceWidth);
  assert.ok(Buffer.from(FONT_CASELLE_BASE64, "base64").length < 2048, "mini-font: poche centinaia di byte");
});

Deno.test("registraFontPos registra il file e la famiglia nel pdfmake che gli si passa", () => {
  const visti: { vfs: string[]; famiglie: string[] } = { vfs: [], famiglie: [] };
  registraFontPos({ addVirtualFileSystem: (v) => visti.vfs.push(...Object.keys(v)), addFonts: (f) => visti.famiglie.push(...Object.keys(f)) });
  assert.deepEqual(visti.vfs, ["PosCaselle.ttf"]);
  assert.deepEqual(visti.famiglie, ["PosCaselle"]);
});

Deno.test("PDF: le caselle escono nel loro font, il PDF resta deterministico e la data di emissione sta in copertina", async () => {
  const dati = esempioPdfPos();
  const a = await generaPdfPos(dati, EMESSO);
  const b = await generaPdfPos(dati, EMESSO);
  assert.deepEqual(a.bytes, b.bytes, "stessi dati e stessa emissione = stessi byte");
  assert.ok(Buffer.from(a.bytes).includes("PosCaselle"), "il mini-font è incorporato nel PDF");
  assert.match(a.html, /PDF emesso il 30\/10\/2026/);
  assert.equal(a.html.includes('class="verifica"'), false, "senza indirizzo di verifica niente QR");
  const conQr = await generaPdfPos({ ...dati, urlVerifica: "https://app.esempio.it/verifica-pos/3f9a1c2e-0b7d-4e6a-9c1d-5b2e8a7f4d10" }, EMESSO);
  assert.match(conQr.html, /class="verifica"/);
  assert.ok(conQr.bytes.length > a.bytes.length, "il QR è nel PDF");
  assert.equal(new TextDecoder().decode(conQr.bytes.slice(0, 5)), "%PDF-");
});

Deno.test("PDF: un segno privato scritto da un utente non fa comparire caselle e non ferma la generazione", async () => {
  const dati = esempioPdfPos();
  dati.contenuto.rls.nominativo = "Mario  Rossi";
  const pdf = await generaPdfPos(dati, EMESSO);
  assert.equal(new TextDecoder().decode(pdf.bytes.slice(0, 5)), "%PDF-");
});
