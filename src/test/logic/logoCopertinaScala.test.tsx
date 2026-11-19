import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Document, renderToBuffer } from "@react-pdf/renderer";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { CopertinaDocumento } from "@/components/preventivi/pdf/DocumentoEdilePDF";
import { datiGenerici } from "@/components/preventivi/pdf/adattatoreGenerico";
import { creaTema } from "@/components/preventivi/pdf/temaDocumento";

const logo = `data:image/png;base64,${readFileSync(path.resolve("public/loghi/impresa-vulcano.png")).toString("base64")}`;
describe("misura della copertina con veste aziendale", () => {
  it.each(["7c87c209-7868-42d0-ad98-6c95ac6de196", "altra-azienda"])("%s rispetta il modello anche quando la veste dà una misura di serie", async company_id => {
    const larghezze: number[] = [];
    for (const percentuale of [60, 100, 160]) {
      const dati = datiGenerici({ quote: { company_id, quote_number: "P-1", client_name: "Cliente prova" }, company: { name: "Impresa", logo_url: logo }, items: [], template: { show_cover_image: false, pdf_cover_logo_size: percentuale } });
      const bytes = await renderToBuffer(<Document><CopertinaDocumento tema={creaTema({})} dati={dati} /></Document>);
      const lettura = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
      const pdf = await lettura.promise;
      try {
        const ops = await (await pdf.getPage(1)).getOperatorList();
        // Il logo è l'unica immagine: la decorazione è vettoriale.
        const i = ops.fnArray.indexOf(OPS.paintImageXObject);
        expect(i, JSON.stringify({ logo: dati.azienda.logoUrl?.length, posizione: dati.modello.copertina.posizioneLogo, pagine: pdf.numPages, operatori: [...new Set(ops.fnArray)] })).toBeGreaterThan(0);
        const t = ops.fnArray.lastIndexOf(OPS.transform, i - 1);
        expect(t).toBeGreaterThanOrEqual(0);
        const trasformazione = ops.argsArray[t] as number[];
        larghezze.push(Math.abs(trasformazione[0]));
        expect(Math.abs(trasformazione[0])).toBeLessThanOrEqual(499);
      } finally { await lettura.destroy(); }
    }
    expect(larghezze[0]).toBeLessThan(larghezze[1]);
    expect(larghezze[2]).toBeGreaterThan(larghezze[1]);
  });
});
