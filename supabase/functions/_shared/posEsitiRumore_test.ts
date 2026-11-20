import assert from "node:assert/strict";
import { PDFDocument } from "npm:pdf-lib@1.17.1";
import { estraiPagineTestoRapportoRumore } from "./pdfExtraction.ts";
import { proponiEsitiRumore } from "./posEsitiRumore.ts";

Deno.test("Il rapporto del rumore può avere un esito valido su una pagina con poche righe", async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  pdf.addPage().drawText("Mansione: Posatore\nLEX,8h: 79,4 dB(A)", { x: 40, y: 770, size: 12, lineHeight: 16 });
  pdf.addPage().drawText("84,1 dB(A)", { x: 40, y: 770, size: 12 });

  const esame = await estraiPagineTestoRapportoRumore(await pdf.save());
  assert.equal(esame.ispezionate, 3);
  assert.deepEqual(esame.illeggibili, [1]);
  assert.deepEqual(proponiEsitiRumore(esame.pagine).map(p => [p.pagina, p.mansione, p.esposizione]), [
    [2, "Posatore", "LEX,8h: 79,4 dB(A)"],
  ]);
});

Deno.test("Legge le colonne native e l'OCR solo quando mansione, metrica e unità sono identificabili", async () => {
  const doc = await PDFDocument.create();
  const p = doc.addPage();
  p.drawText("Mansione", { x: 40, y: 760 });
  p.drawText("LEX,8h dB(A)", { x: 270, y: 760 });
  p.drawText("Pressione", { x: 430, y: 760 });
  p.drawText("Posatore", { x: 40, y: 732 });
  p.drawText("79,4", { x: 270, y: 732 });
  p.drawText("96,1", { x: 430, y: 732 });
  const nativo = await estraiPagineTestoRapportoRumore(await doc.save());
  const esiti = proponiEsitiRumore([...nativo.pagine,
    { pagina: 3, metodo: "ocr", testo: "Mansione | Lavorazione | LEX,w dB(A)\nAutista | Scarifica | 80,7" },
    { pagina: 4, testo: "Mansione | LEX,8h | LEX,w\nOperaio | 82,3 | 100" },
    { pagina: 5, testo: "Mansione | LEX,8h dB(A) | LEX,w dB(A)\nOperaio | 82,3" },
  ]);
  assert.deepEqual(esiti.map(e => [e.pagina, e.mansione, e.esposizione, e.metodo]), [
    [1, "Posatore", "LEX,8h: 79,4 dB(A)", undefined],
    [3, "Autista", "LEX,w: 80,7 dB(A)", "ocr"],
  ]);
});
