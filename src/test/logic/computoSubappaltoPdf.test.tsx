import { expect, it } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer/lib/react-pdf.js";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { ComputoSubappaltoPDF, type DatiComputoSubappalto } from "@/components/subappaltatori/ComputoSubappaltoPDF";
import { writeFileSync } from "node:fs";
import { generaPdfComputoSubappalto } from "@/lib/subappaltatori/computoPdf";

const dati: DatiComputoSubappalto = {
  azienda: "Impresa di collaudo", companyId: "demo-isolata", ditta: "Edil Alfa S.r.l.", numero: "ORD-012/S01", commessa: "ORD-012", revisione: 3, bozza: false, oneri: 100,
  righe: [
    { fase: "Finiture", sottofase: "Piano terra", descrizione: "Intonaco civile interno", quantita: 120, prezzo: 10, importo: 1200, unita: "mq", comprende: "posa" },
    { fase: "Finiture", sottofase: "Primo piano", descrizione: "Rasatura aggiuntiva", quantita: 30, prezzo: 10, importo: 300, unita: "mq", comprende: "posa" },
  ],
};

it("il comando di esportazione restituisce un file PDF scaricabile", async () => {
  const blob = await generaPdfComputoSubappalto(dati);
  expect(blob.type).toBe("application/pdf");
  expect(blob.size).toBeGreaterThan(1000);
});

async function leggi(d: DatiComputoSubappalto) {
  const bytes = await renderToBuffer(<ComputoSubappaltoPDF dati={d} />);
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
  const documento = await task.promise;
  const pagine: string[] = [];
  for (let i = 1; i <= documento.numPages; i++) pagine.push((await (await documento.getPage(i)).getTextContent()).items.map((x) => "str" in x ? x.str : "").join(" "));
  await task.destroy();
  return { bytes, pagine, testo: pagine.join(" ").replace(/\s+/g, " ") };
}

it("stampa il computo reale con fasi, sottofasi, prezzi della ditta, revisione e totale comprensivo degli oneri", async () => {
  const r = await leggi(dati);
  expect(r.pagine).toHaveLength(1);
  expect(r.testo).toContain("Computo del subappalto");
  for (const testo of ["ORD-012/S01", "revisione 3", "Finiture", "Piano terra", "Primo piano", "120", "30", "1.200,00", "300,00", "1.600,00", "solo posa"]) expect(r.testo).toContain(testo);
  expect(r.testo).not.toMatch(/margine|venduto|prezzo di vendita/i);
  // Artefatto facoltativo per il collaudo visivo; il test ordinario non scrive file nel repository.
  if (process.env.EIC_SUBAPPALTO_PDF_PROVA) writeFileSync(process.env.EIC_SUBAPPALTO_PDF_PROVA, r.bytes);
});

it("il documento multipagina conserva tutte le voci e indica quando i costi sono ancora in bozza", async () => {
  const righe = Array.from({ length: 90 }, (_, i) => ({ ...dati.righe[0], fase: `Fase ${Math.floor(i / 15) + 1}`, descrizione: `Lavorazione ${i + 1} con descrizione estesa e finitura della parete interna`, quantita: 1, prezzo: 12.35, importo: 12.35 }));
  const r = await leggi({ ...dati, bozza: true, righe, oneri: 0 });
  expect(r.pagine.length).toBeGreaterThan(1);
  expect(r.testo).toContain("BOZZA");
  expect(r.testo).toContain("Costi proposti da confermare");
  expect(r.testo).toContain("Lavorazione 90");
  expect(r.testo).toContain("1.111,50");
}, 30_000);
