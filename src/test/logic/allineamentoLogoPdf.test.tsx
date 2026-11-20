import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { normalizzaAllineamentoLogo, disponiLogoTestata, type AllineamentoLogo } from "../../../supabase/functions/_shared/dimensioniLogo";
import { modelloPdfStandard, normalizzaModelloPdf } from "@/lib/modelliPdf/catalogo";
import { creaPdfOperativo } from "@/lib/documentiOperativi/pdf";
import { documentoEsempio } from "@/lib/modelliPdf/anteprima";
import { renderRapportino } from "../../../supabase/functions/genera-pdf-rapportino/render";
import { documentoHtml } from "../../../supabase/functions/generate-native-pdf/documentoHtml";
import { PreviewFattura } from "@/components/fatturazione/PreviewFattura";
import type { AnagraficaAzienda, RiepilogoIVA } from "@/types/fatturazione";
import type { ComponentProps } from "react";

const png = readFileSync(path.resolve("public/loghi/impresa-vulcano.png"));
const logo = `data:image/png;base64,${png.toString("base64")}`;
const POSIZIONI: AllineamentoLogo[] = ["left", "center", "right"];
const qa = process.env.EIC_LOGO_QA_DIR;
async function esempio(nome: string, dati: string | Uint8Array) {
  if (!qa) return;
  await mkdir(qa, { recursive: true });
  await writeFile(path.join(qa, nome), dati);
}

type Rettangolo = { x: number; y: number; w: number; h: number };
function moltiplica(a: number[], b: number[]) {
  return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
}

/** Verifica il PDF realmente emesso: coordinate delle immagini e del testo, non il sorgente del renderer. */
async function verificaPdf(bytes: Uint8Array, posizione: AllineamentoLogo, tutteLePagine = false) {
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
  const pdf = await task.promise;
  try {
    for (let n = 1; n <= (tutteLePagine ? pdf.numPages : 1); n++) {
      const pagina = await pdf.getPage(n);
      const { width } = pagina.getViewport({ scale: 1 });
      const ops = await pagina.getOperatorList();
      const stack: number[][] = [];
      let m = [1, 0, 0, 1, 0, 0];
      const immagini: Rettangolo[] = [];
      ops.fnArray.forEach((op, i) => {
        if (op === OPS.save) stack.push([...m]);
        else if (op === OPS.restore) m = stack.pop() ?? [1,0,0,1,0,0];
        else if (op === OPS.transform) m = moltiplica(m, ops.argsArray[i] as number[]);
        else if (op === OPS.paintImageXObject || op === OPS.paintInlineImageXObject) {
          immagini.push({ x: m[4], y: m[5], w: m[0], h: m[3] });
        }
      });
      expect(immagini).toHaveLength(1);
      const immagine = immagini[0];
      expect(immagine.x).toBeGreaterThanOrEqual(28);
      expect(immagine.x + immagine.w).toBeLessThanOrEqual(width - 28);
      if (posizione === "center") expect(immagine.x + immagine.w / 2).toBeCloseTo(width / 2, 1);
      else if (posizione === "left") expect(immagine.x).toBeLessThan(52);
      else expect(width - immagine.x - immagine.w).toBeLessThan(52);
      const testo = (await pagina.getTextContent()).items.filter(t => "str" in t && t.str.trim()) as Array<{ str: string; width: number; height: number; transform: number[] }>;
      const collisioni = testo.filter(t => {
        const dx = Math.min(t.transform[4] + t.width, immagine.x + immagine.w) - Math.max(t.transform[4], immagine.x);
        const dy = Math.min(t.transform[5] + t.height * .8, immagine.y + immagine.h) - Math.max(t.transform[5] - t.height * .2, immagine.y);
        return dx > .5 && dy > .5;
      });
      expect(collisioni.map(t => t.str), `Testo sovrapposto al logo a pagina ${n}`).toEqual([]);
    }
    return pdf.numPages;
  } finally { await task.destroy(); }
}

describe("allineamento del logo e compatibilità dei modelli", () => {
  it("conserva le tre scelte e mantiene a sinistra i modelli precedenti", () => {
    for (const p of POSIZIONI) expect(normalizzaModelloPdf("materiali", { allineamentoLogo: p }).allineamentoLogo).toBe(p);
    for (const p of [undefined, null, {}, "background: red", "LEFT"]) expect(normalizzaAllineamentoLogo(p)).toBe("left");
    expect(normalizzaModelloPdf("materiali", { scalaLogo: 175 }).allineamentoLogo).toBe("left");
  });
  it("dedica una riga al logo centrato e sposta il testo sotto quando il logo occupa la sua colonna", () => {
    expect(disponiLogoTestata(180, 60, 70, "right", 8)).toMatchObject({ logoX: 120, titoloSotto: false, allineamentoTesto: "left", larghezzaTesto: 112 });
    expect(disponiLogoTestata(180, 60, 70, "center", 8)).toMatchObject({ logoX: 60, titoloSotto: true, larghezzaTesto: 180 });
    for (const posizione of POSIZIONI) expect(disponiLogoTestata(180, 160, 70, posizione, 8).titoloSotto).toBe(true);
  });
});

describe.each(["materiali", "richiesta", "servizi", "trasporti", "economia"] as const)("PDF %s: logo e dati non si coprono", tipo => {
  it.each(POSIZIONI)("%s, anche al 250% e con riferimenti lunghi", async allineamentoLogo => {
    for (const scalaLogo of [100, 250]) {
      const d = { ...documentoEsempio(tipo), numero: "ODA-DEMO-20261120-RIFERIMENTO-FORNITURA-CANTIERE-123456789" };
      if (tipo === "materiali") d.righe = Array.from({ length: 28 }, (_, i) => ({ ...d.righe[i % 2], descrizione: `Articolo ${i + 1} per verifica della testata nelle pagine successive` }));
      const pdf = creaPdfOperativo(d, { id: "7c87c209-7868-42d0-ad98-6c95ac6de196", name: "Impresa di prova" }, logo,
        { ...modelloPdfStandard(tipo), titolo: "DOCUMENTO DI PROVA PER LA FORNITURA DEL CANTIERE", scalaLogo, allineamentoLogo });
      const bytes = new Uint8Array(pdf.output("arraybuffer"));
      const pagine = await verificaPdf(bytes, allineamentoLogo, true);
      if (tipo === "materiali") expect(pagine).toBeGreaterThan(1);
      await esempio(`${tipo}-${allineamentoLogo}-${scalaLogo}.pdf`, bytes);
    }
  }, 20000);
});

describe.each([false, true])("rapportino e fine lavori (fine: %s)", fine => {
  it.each(POSIZIONI)("%s: riserva lo spazio al titolo, al riferimento e allo stato", async allineamentoLogo => {
    for (const scalaLogo of [100, 250]) {
      const r = await renderRapportino({
        report: { id: "00000000-0000-4000-8000-000000000001", stato: "bozza", data_lavoro: "2026-11-20", lavoro_completato: fine, ore_lavorate: 8, descrizione_lavori: "Lavorazioni di esempio", meteo: "Sereno con vento moderato" },
        company: { id: "7c87c209-7868-42d0-ad98-6c95ac6de196", name: "Impresa di prova" },
        branding: { primaryColor: "#123456", logoUrl: "logo-prova" }, phases: [], punches: [], warnings: [], revision: "QA", generatedAt: "2026-11-20T07:00:00Z",
        modelloPdf: { ...modelloPdfStandard(fine ? "fine_lavori" : "rapportino"), allineamentoLogo, scalaLogo },
      }, async () => new Uint8Array(png));
      await verificaPdf(r.bytes, allineamentoLogo);
      await esempio(`${fine ? "fine-lavori" : "rapportino"}-${allineamentoLogo}-${scalaLogo}.pdf`, r.bytes);
    }
  }, 20000);
});

describe.each(POSIZIONI)("fatture: anteprima e documento HTML con logo %s", allineamento_logo => {
  it.each([100, 250])("stessa testata al %s%%, dati fiscali conservati", async scala_logo => {
    const azienda = { ragione_sociale: "Impresa di esempio con ragione sociale estesa", partita_iva: "12345678901", indirizzo_via: "Via del Cantiere 12", indirizzo_comune: "Milano", logo_url: logo, scala_logo, allineamento_logo } as AnagraficaAzienda;
    const documento = { tipo: "fattura", numero: "FT-2026-123456789012345678901234567890", data_emissione: "2026-11-20", cliente_snapshot: { tipo_cliente: "B2B", ragione_sociale: "Cliente esempio" }, righe: [{ id: "1", numero_linea: 1, descrizione: "Lavorazioni di prova", quantita: 1, prezzo_unitario: 1000, imponibile: 1000, aliquota_iva: "22", imposta: 220, totale_riga: 1220 }], riepilogo_iva: [] as RiepilogoIVA[], imponibile_totale: 1000, iva_totale: 220, totale_documento: 1220, totale_da_pagare: 1220 };
    const html = documentoHtml(documento, azienda);
    const anteprima = renderToStaticMarkup(<PreviewFattura documento={documento as unknown as ComponentProps<typeof PreviewFattura>["documento"]} azienda={azienda} scale={1} />);
    const server = new DOMParser().parseFromString(html, "text/html");
    const client = new DOMParser().parseFromString(anteprima, "text/html");
    for (const doc of [server, client]) {
      expect(doc.querySelectorAll(".fd-testata > .fd-logo-blocco > img")).toHaveLength(1);
      expect(doc.querySelector(".fd-testata")?.classList.contains("fd-con-logo")).toBe(true);
      expect(doc.querySelector(".fd-emittente")?.textContent).toContain(azienda.partita_iva);
      expect(doc.querySelector(".fd-documento")?.textContent).toContain(documento.numero);
      expect(doc.querySelector(".fd-foglio")?.textContent).toContain("1.220,00");
    }
    expect(server.querySelector("style")?.textContent).toContain(client.querySelector("style")?.textContent);
    await esempio(`fattura-${allineamento_logo}-${scala_logo}.html`, html);
  });
});
