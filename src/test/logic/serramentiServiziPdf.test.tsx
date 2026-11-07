import { expect, it } from "vitest";
import { Document, Page } from "@react-pdf/renderer";
import { renderToBuffer } from "@react-pdf/renderer/lib/react-pdf.js";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { ServiziPreventivoPdf } from "@/components/serramenti/ServiziPreventivoPdf";
import type { SrServizioRow } from "@/types/serramenti";

it("BUG-78: il PDF descrive il trasporto incluso con quantità e importo", async () => {
  const servizio = { id: "demo", descrizione: "GUIDADEMO Trasporto simulato", quantita: 1, unita: "pz", prezzo_unitario_vendita: 20, prezzo_totale_vendita: 20 } as SrServizioRow;
  const buffer = await renderToBuffer(<Document><Page><ServiziPreventivoPdf servizi={[servizio]} mostraImporti /></Page></Document>);
  const pdf = await getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise;
  const content = await (await pdf.getPage(1)).getTextContent();
  const text = content.items.map(x => "str" in x ? x.str : "").join(" ");
  expect(text).toContain("GUIDADEMO Trasporto simulato");
  expect(text).toContain("Quantità 1 pz");
  expect(text).toContain("20,00");
  await pdf.cleanup();
}, 30000);
