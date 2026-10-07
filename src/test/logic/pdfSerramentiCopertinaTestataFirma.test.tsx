/**
 * Il PDF dei serramenti dopo le richieste di Renova (05/10/2026, valgono per tutte le aziende):
 *  - copertina: niente «A cura di», e col logo non si ripete il nome dell'azienda (senza logo il nome resta);
 *  - ogni pagina: in testata l'azienda e il numero della stima, non il nome del cliente;
 *  - «La tua consulenza»: il telefono sì, l'email del profilo no (è quella con cui il consulente entra nel gestionale);
 *  - la pagina da firmare si chiama «ACCETTAZIONE PROPOSTA», e l'Art. 1 dice dove sono i lavori (non «presso .»).
 * Renderer vero, offline: si legge il testo del PDF come lo legge il cliente.
 */
import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createFullSerramentiTemplate } from "@/lib/moduli-vendita/fullSerramentiModules";
import { withSerramentiCoverLayout, type SerramentiCoverLayout } from "@/lib/moduli-vendita/serramentiCoverLayout";
import { buildMockPdfData } from "@/lib/serramenti/mockPdfData";
import { SR_PDF_PAGES_META } from "@/types/serramenti";
import { SerramentoPDF } from "@/components/serramenti/SerramentoPDF";

vi.setConfig({ testTimeout: 240_000 });
vi.mock("@/lib/storage/immaginiModelloPdf", () => ({ CAMPI_IMMAGINE_SERRAMENTI: [], firmaImmagine: async (v: unknown) => v, firmaImmaginiModello: async (v: unknown) => v }));
vi.mock("@/lib/pdf/votiOnline", () => ({ votiOnlineAzienda: async (): Promise<null> => null }));
vi.mock("@/lib/serramenti/pdfImageUtils", () => ({ toDataUrl: async (url: string | null): Promise<string | null> => {
  if (!url || url.startsWith("data:")) return url;
  if (url.startsWith(window.location.origin + "/")) url = new URL(url).pathname;
  if (!url.startsWith("/")) throw new Error(`Remote image forbidden: ${url}`);
  const bytes = await readFile(path.resolve("public", url.slice(1)));
  return `data:image/${url.endsWith(".png") ? "png" : "jpeg"};base64,${bytes.toString("base64")}`;
} }));

/** Una pagina del PDF: tutto il testo, e solo quello della testata (la fascia in alto, sopra il contenuto). */
interface Pagina { testo: string; testata: string }

const AZIENDA = "Impresa esempio";
const LOGO = "/icons/icon-192.png";

async function pagineDelPdf(opts: {
  logo: boolean;
  layout?: SerramentiCoverLayout;
  tuttePagine?: boolean;
  progetto?: Record<string, unknown>;
}): Promise<Pagina[]> {
  const base = createFullSerramentiTemplate({ company_id: "qa", ragione_sociale: AZIENDA }, "finestre");
  const template = {
    ...base,
    ...(opts.layout ? { pdf_blocchi: withSerramentiCoverLayout(base.pdf_blocchi, opts.layout) } : {}),
    // Con «tuttePagine» ci sono anche le condizioni e la pagina da firmare (il modello di prova le spegne: senza
    // testo scritto dall'azienda valgono quelle di base dei serramenti); senza, il documento è corto e la prova veloce.
    ...(opts.tuttePagine ? {
      pdf_pages_order: SR_PDF_PAGES_META.map((p) => ({ id: p.id, visible: true })),
      condizioni_legali_attivo: true,
      condizioni_legali_testo: null as string | null,
    } : {}),
  };
  const dati = await buildMockPdfData({ template, companyName: AZIENDA, companyLogoUrl: opts.logo ? LOGO : null });
  if (opts.progetto) Object.assign(dati.detail.progetto, opts.progetto);
  const bytes = await renderToBuffer(SerramentoPDF(dati) as Parameters<typeof renderToBuffer>[0]);
  const pdf = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
  const pagine: Pagina[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const oggetti = (await (await pdf.getPage(i)).getTextContent()).items.filter((x) => "str" in x) as Array<{ str: string; transform: number[] }>;
    pagine.push({
      testo: oggetti.map((x) => x.str).join(" ").replace(/\s+/g, " "),
      // La testata sta nei primi ~60 punti della pagina A4 (841,9): sopra i 735 non c'è altro.
      testata: oggetti.filter((x) => x.transform[5] > 735).map((x) => x.str).join(" ").replace(/\s+/g, " "),
    });
  }
  return pagine;
}

/** Il testo senza spazi e in minuscolo: il nome in copertina è spaziato lettera per lettera («I M P R E S A…»). */
const piatto = (s: string) => s.replace(/\s+/g, "").toLowerCase();

describe.each<SerramentiCoverLayout>(["classico", "editoriale-v1"])("copertina dei serramenti, layout «%s»", (layout) => {
  it("col logo: né il nome dell'azienda né «A cura di»", async () => {
    const [copertina] = await pagineDelPdf({ logo: true, layout });
    expect(piatto(copertina.testo).includes("impresaesempio"), "il nome accanto al logo").toBe(false);
    expect(copertina.testo.includes("A cura di"), "«A cura di»").toBe(false);
    expect(copertina.testo.includes("Marco Bianchi"), "il consulente in copertina").toBe(false);
    // La copertina c'è: porta il numero del preventivo.
    expect(copertina.testo.includes("SF-DEMO-0001")).toBe(true);
  });

  it("senza logo il nome dell'azienda resta (al posto del logo c'è lui)", async () => {
    const [copertina] = await pagineDelPdf({ logo: false, layout });
    expect(piatto(copertina.testo).includes("impresaesempio")).toBe(true);
    expect(copertina.testo.includes("A cura di")).toBe(false);
  });
});

describe("copertina «classico»: l'indirizzo scritto sotto il nome non sparisce col nome", () => {
  it("col logo restano l'indirizzo dell'azienda (non il nome)", async () => {
    const [copertina] = await pagineDelPdf({ logo: true, layout: "classico" });
    expect(copertina.testo.includes("Via Esempio 1, 20100 Milano")).toBe(true);
    expect(piatto(copertina.testo).includes("impresaesempio")).toBe(false);
  });
});

describe("il resto del documento (con tutte le pagine)", () => {
  // Lavori a Trieste, cliente senza indirizzo: come il preventivo di Renova (06/10/2026 li ha separati).
  const lavoriAltrove: Record<string, unknown> = { cliente_indirizzo: null, cantiere_indirizzo: "Via Monte", cantiere_citta: "Trieste", cliente_citta: null };

  it("testata: azienda e numero della stima in ogni pagina, mai il nome del cliente", async () => {
    const pagine = await pagineDelPdf({ logo: true, tuttePagine: true, progetto: lavoriAltrove });
    const interne = pagine.slice(1);
    expect(interne.length).toBeGreaterThan(5);
    for (const [i, p] of interne.entries()) {
      expect(p.testata.includes(AZIENDA) && p.testata.includes("STIMA N.") && p.testata.includes("SF-DEMO-0001"), `testata della pagina ${i + 2}: «${p.testata}»`).toBe(true);
      expect(/Mario|Rossi/.test(p.testata), `il cliente nella testata della pagina ${i + 2}: «${p.testata}»`).toBe(false);
    }
    // Il nome del cliente resta dove serve: in anagrafica e nella pagina da firmare.
    expect(pagine.some((p) => p.testo.includes("Intestatario Mario Rossi") || p.testo.includes("Mario Rossi"))).toBe(true);
  });

  it("«La tua consulenza»: il telefono sì, l'email del profilo no", async () => {
    const pagine = await pagineDelPdf({ logo: true, tuttePagine: true, progetto: lavoriAltrove });
    const documento = pagine.map((p) => p.testo).join(" ");
    expect(documento.includes("LA TUA CONSULENZA"), "la sezione c'è").toBe(true);
    expect(documento.includes("Marco Bianchi"), "il consulente").toBe(true);
    expect(documento.includes("+39 02 12345678"), "il telefono del consulente").toBe(true);
    expect(documento.includes("marco.bianchi@example.com"), "l'email del profilo").toBe(false);
    // Le email dell'azienda (piè di pagina) non c'entrano e restano.
    expect(documento.includes("info@example.com")).toBe(true);
  });

  it("la pagina da firmare è «ACCETTAZIONE PROPOSTA» e l'Art. 1 dice dove sono i lavori", async () => {
    const pagine = await pagineDelPdf({ logo: true, tuttePagine: true, progetto: lavoriAltrove });
    const documento = pagine.map((p) => p.testo).join(" ");
    expect(documento.includes("ACCETTAZIONE PROPOSTA"), "il titolo nuovo").toBe(true);
    expect(documento.includes("Firma del contratto"), "il titolo vecchio").toBe(false);
    // Prima: «…(di seguito «il Committente»), presso .» perché l'indirizzo del cliente era vuoto.
    expect(documento.includes("presso Via Monte, Trieste"), "Art. 1 col luogo dei lavori").toBe(true);
    expect(/presso \./.test(documento), "«presso .» vuoto").toBe(false);
  });
});
