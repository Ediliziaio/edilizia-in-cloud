/**
 * Genera i file d'esempio delle esportazioni 2D in docs/planimetrie/esempi-esportazione/
 * dalla pianta d'esempio: PDF A3 1:50 (e A4 adattato), DXF, SVG, PNG,
 * pianta da presentazione. Il PNG passa dal canvas di Chromium (Playwright),
 * con lo stesso codice che gira nel browser.
 *
 *   bun scripts/planimetrie/esempi-esportazione.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { vistaDaPlanimetria } from "../../src/lib/planimetrie/esporta/adattatore";
import { PIANTA_ESEMPIO } from "../../src/lib/planimetrie/esporta/esempio";
import { esportaDxf } from "../../src/lib/planimetrie/esporta/dxf";
import { esportaPdf } from "../../src/lib/planimetrie/esporta/pdf";
import { dimensioniPng } from "../../src/lib/planimetrie/esporta/png";
import { esportaSvg } from "../../src/lib/planimetrie/esporta/svg";
import { allegatoPreventivo } from "../../src/lib/planimetrie/esporta/allegato";
import type { DatiCartiglio } from "../../src/lib/planimetrie/esporta/tipi";

const cartella = join(import.meta.dir, "../../docs/planimetrie/esempi-esportazione");
mkdirSync(cartella, { recursive: true });
const scrivi = (nome: string, dati: Uint8Array | string) => {
  writeFileSync(join(cartella, nome), dati);
  console.log("scritto", nome);
};

const cartiglio: DatiCartiglio = {
  azienda: {
    nome: "Edil Rossi S.r.l.",
    indirizzo: "Via dei Mille 8, 20121 Milano (MI)",
    partitaIva: "01234567890",
    telefono: "02 1234567",
    email: "ufficio@edilrossi.it",
    colore: "#1E6B52",
  },
  cliente: "Mario Bianchi",
  indirizzoCantiere: "Via Roma 12, 20900 Monza (MB) — interno 4",
  data: new Date("2026-10-30"),
  versione: "v3",
  tavola: "1/1",
};

const confronto = vistaDaPlanimetria(PIANTA_ESEMPIO, { modo: "confronto" });
const progetto = vistaDaPlanimetria(PIANTA_ESEMPIO, { modo: "progetto" });
const fatto = vistaDaPlanimetria(PIANTA_ESEMPIO, { modo: "fatto" });

const a3 = await esportaPdf(confronto, { ...cartiglio, oggetto: "Stato comparativo (demolizioni e nuove costruzioni)" }, {
  formato: "A3", orientamento: "orizzontale", scala: 50,
});
scrivi("pianta-A3-1-50-comparativo.pdf", a3.dati);
const a4 = await esportaPdf(fatto, { ...cartiglio, oggetto: "Rilievo stato di fatto" }, { formato: "A4", orientamento: "verticale", scala: "auto" });
scrivi("pianta-A4-verticale-adattata-fatto.pdf", a4.dati);
const pres = await esportaPdf(progetto, { ...cartiglio, oggetto: "Pianta da presentazione" }, {
  formato: "A3", orientamento: "orizzontale", scala: 50, stile: "presentazione",
});
scrivi("pianta-A3-1-50-presentazione.pdf", pres.dati);
const allegato = await allegatoPreventivo(progetto, { ...cartiglio, oggetto: "Stato di progetto" });
scrivi(allegato.nomeFile, allegato.dati);

const dxf = esportaDxf(confronto, { scala: 50 });
scrivi("pianta-comparativo.dxf", dxf.dati);
writeFileSync(join(cartella, "pianta-comparativo.dxf.conteggio.json"), JSON.stringify(dxf.conteggio, null, 2) + "\n");

const svgTecnico = esportaSvg(confronto, { scala: 50 });
scrivi("pianta-comparativo-1-50.svg", svgTecnico.svg);
const svgPres = esportaSvg(progetto, { scala: 50, stile: "presentazione", sfondo: "trasparente" });
scrivi("pianta-presentazione-1-50-trasparente.svg", svgPres.svg);

// PNG: lo stesso SVG passato sul canvas di Chromium
const { chromium } = await import("playwright");
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const png = async (svg: string, larghezzaMm: number, altezzaMm: number, dpi: number) => {
    const d = dimensioniPng(larghezzaMm, altezzaMm, dpi);
    const b64 = await page.evaluate(async ({ svg, w, h }) => {
      const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      const img = new Image();
      await new Promise<void>((ok, ko) => { img.onload = () => ok(); img.onerror = () => ko(new Error("svg")); img.src = url; });
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d")!.drawImage(img, 0, 0, w, h);
      return c.toDataURL("image/png").split(",")[1];
    }, { svg, w: d.larghezzaPx, h: d.altezzaPx });
    return { dati: Buffer.from(b64, "base64"), ...d };
  };
  const p1 = await png(svgTecnico.svg, svgTecnico.larghezzaMm, svgTecnico.altezzaMm, 200);
  scrivi("pianta-comparativo-1-50-200dpi.png", p1.dati);
  const p2 = await png(svgPres.svg, svgPres.larghezzaMm, svgPres.altezzaMm, 200);
  scrivi("pianta-presentazione-trasparente-200dpi.png", p2.dati);
  const svgPresBianco = esportaSvg(progetto, { scala: 50, stile: "presentazione", sfondo: "bianco" });
  const p3 = await png(svgPresBianco.svg, svgPresBianco.larghezzaMm, svgPresBianco.altezzaMm, 200);
  scrivi("pianta-presentazione-bianco-200dpi.png", p3.dati);
} finally {
  await browser.close();
}
