/**
 * Il disegno dei modelli d'intervento dei serramenti (finestre, persiane, portoni garage…), 07/10/2026.
 * Misurato sui nove modelli resi davvero: pagine mezze vuote (il percorso, 45% di foglio bianco, col testo a 7,5 e 8,5 punti),
 * una pagina con una riga sola (i portoni garage), le carte del percorso sempre blu notte anche nei modelli verdi o marroni.
 * Renderer vero, offline: si legge il PDF come lo legge il cliente.
 */
import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createFullSerramentiTemplate } from "@/lib/moduli-vendita/fullSerramentiModules";
import { FULL_SERRAMENTI_MODULES } from "@/lib/moduli-vendita/fullSerramentiModules";
import { buildMockPdfData } from "@/lib/serramenti/mockPdfData";
import { SR_PDF_PAGES_META } from "@/types/serramenti";
import { SerramentoPDF } from "@/components/serramenti/SerramentoPDF";
import { ALTEZZA_UTILE, altezzaPercorsoAmpio, carteDelPercorsoPerRiga, paddingCartaPercorso } from "@/components/serramenti/impaginaSerramento";
import type { SerramentiTemplateModuleId } from "@/lib/moduli-vendita/serramentiTemplateModules";

vi.setConfig({ testTimeout: 300_000 });
vi.mock("@/lib/storage/immaginiModelloPdf", () => ({ CAMPI_IMMAGINE_SERRAMENTI: [], firmaImmagine: async (v: unknown) => v, firmaImmaginiModello: async (v: unknown) => v }));
vi.mock("@/lib/pdf/votiOnline", () => ({ votiOnlineAzienda: async (): Promise<null> => null }));
vi.mock("@/lib/serramenti/pdfImageUtils", () => ({ toDataUrl: async (url: string | null): Promise<string | null> => {
  if (!url || url.startsWith("data:")) return url;
  if (url.startsWith(window.location.origin + "/")) url = new URL(url).pathname;
  if (!url.startsWith("/")) throw new Error(`Remote image forbidden: ${url}`);
  const bytes = await readFile(path.resolve("public", url.slice(1)));
  return `data:image/${url.endsWith(".png") ? "png" : "jpeg"};base64,${bytes.toString("base64")}`;
} }));

type DatiMock = Awaited<ReturnType<typeof buildMockPdfData>>;
interface Voce { y: number; corpo: number; testo: string }
interface PaginaLetta { numero: number; voci: Voce[]; testo: string; /** I colori di riempimento usati, in esadecimale minuscolo (con ripetizioni: ogni uso conta). */ fill: string[] }

/** Le pagine del PDF: ogni voce di testo col suo corpo (in punti) e la sua quota dal basso; i colori di riempimento usati. */
async function leggi(dati: DatiMock): Promise<PaginaLetta[]> {
  const bytes = await renderToBuffer(SerramentoPDF(dati) as Parameters<typeof renderToBuffer>[0]);
  const pdf = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
  const pagine: PaginaLetta[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const pagina = await pdf.getPage(i);
    const oggetti = (await pagina.getTextContent()).items.filter((x) => "str" in x) as Array<{ str: string; transform: number[] }>;
    const voci = oggetti
      .filter((o) => o.str.trim())
      .map((o) => ({ y: Math.round(o.transform[5]), corpo: Math.round(Math.hypot(o.transform[0], o.transform[1]) * 10) / 10, testo: o.str }));
    const ops = await pagina.getOperatorList();
    const fill: string[] = [];
    ops.fnArray.forEach((f, k) => {
      if (f !== OPS.setFillRGBColor) return;
      const arg = (ops.argsArray[k] as unknown[] | null)?.[0];
      if (typeof arg === "string") fill.push(arg.toLowerCase());
    });
    pagine.push({ numero: i, voci, testo: oggetti.map((o) => o.str).join(" ").replace(/\s+/g, " "), fill });
  }
  return pagine;
}

const piatto = (t: string) => t.replace(/\s+/g, "").toLowerCase();
const AZIENDA = "Impresa esempio";

interface Opzioni {
  modulo?: SerramentiTemplateModuleId;
  /** Un modello d'azienda (con le foto di serie nelle pagine), non un modello d'intervento. */
  azienda?: boolean;
  percorso?: { fasi: number; passi?: number; lunghi?: boolean };
  righe?: number;
}

async function datiDi(o: Opzioni = {}): Promise<DatiMock> {
  const modulo = o.modulo ?? "finestre";
  const base = createFullSerramentiTemplate({ company_id: "qa", ragione_sociale: AZIENDA }, modulo);
  const template: Record<string, unknown> = {
    ...base,
    pdf_pages_order: SR_PDF_PAGES_META.map((p) => ({ id: p.id, visible: true })),
    ...(o.azienda ? { id: "tpl-azienda", pdf_blocchi: {} } : {}),
  };
  if (o.percorso) {
    const { fasi, passi = 3, lunghi = false } = o.percorso;
    template.percorso_cliente = {
      attivo: true, titolo: "Dalle scelte alla consegna", sottotitolo: "Le fasi del tuo intervento.",
      fasi: Array.from({ length: fasi }, (_, i) => ({
        nome: lunghi ? `Organizzazione del cantiere ${i + 1}` : `Fase ${i + 1}`, icona: "chiamata",
        step: Array.from({ length: passi }, (_, k) => (lunghi ? `Verifica dettagliata delle condizioni del vano e dei supporti numero ${k + 1}` : `Passaggio ${k + 1}`)),
      })),
    };
  }
  const dati = await buildMockPdfData({ moduleId: o.azienda ? undefined : modulo, template: template as never, companyName: AZIENDA, companyLogoUrl: null });
  if (o.righe) {
    const prima = dati.detail.serramenti[0];
    dati.detail.serramenti = Array.from({ length: o.righe }, (_, i) => ({ ...prima, id: `r${i}`, position: i, ambiente: `Vano ${i + 1}` }));
  }
  return dati;
}

/** L'occhiello è spaziato lettera per lettera: si cerca senza spazi. */
const paginaDelPercorso = (pagine: PaginaLetta[]) => pagine.find((p) => piatto(p.testo).includes("iltuopercorso") && piatto(p.testo).includes("passaggi"));
/** I passaggi delle carte: le voci «Passaggio n» o quelle lunghe, escluse le etichette. */
const testoDeiPassaggi = (p: PaginaLetta) => p.voci.filter((v) => /^(Passaggio|Verifica dettagliata|Misure|Esigenze|Aperture|Telaio|Ferramenta|Lavorazioni|Schede|Prezzo|Tempi|Posa|Prova|Documenti)/.test(v.testo));

describe("modelli d'intervento: «Il tuo percorso» a carte larghe", () => {
  it("senza foto le fasi sono due carte per due righe e il passaggi si leggono a 10,5 punti (prima quattro carte strette da 8,5)", async () => {
    const pagine = await leggi(await datiDi());
    const pagina = paginaDelPercorso(pagine);
    expect(pagina, "la pagina del percorso").toBeTruthy();
    const passaggi = testoDeiPassaggi(pagina!);
    expect(passaggi.length, "i dodici passaggi").toBeGreaterThanOrEqual(12);
    for (const v of passaggi) expect(v.corpo, `«${v.testo}»`).toBeGreaterThanOrEqual(10);
    // Il foglio è pieno per più dei tre quarti: l'ultima riga di testo del corpo sta nel quarto basso della pagina (dalla quota 330 in giù).
    const corpo = pagina!.voci.filter((v) => v.y > 95 && v.y < 731);
    expect(Math.min(...corpo.map((v) => v.y)), "l'ultimo passaggio, dal basso").toBeLessThan(250);
  });

  it("la stima dell'altezza dice che quattro fasi da tre passaggi ci stanno, e sei fasi lunghe no", () => {
    const fasi = (n: number, lunghi: boolean) => Array.from({ length: n }, (_, i) => ({
      nome: lunghi ? `Organizzazione del cantiere ${i + 1}` : `Fase ${i + 1}`,
      step: [1, 2, 3].map((k) => (lunghi ? `Verifica dettagliata delle condizioni del vano e dei supporti numero ${k}` : `Passaggio ${k}`)),
    }));
    const dati = (n: number, lunghi: boolean) => ({ titolo: "Dalle scelte alla consegna", sottotitolo: "Le fasi del tuo intervento.", fasi: fasi(n, lunghi) });
    expect(altezzaPercorsoAmpio(dati(4, false))).toBeLessThanOrEqual(ALTEZZA_UTILE - 8);
    expect(altezzaPercorsoAmpio(dati(6, true))).toBeGreaterThan(ALTEZZA_UTILE - 8);
    // Quattro fasi fanno due righe da due, cinque e sei due righe da tre; il respiro dentro la carta scende con tre per riga.
    expect([1, 2, 3, 4, 5, 6, 7].map(carteDelPercorsoPerRiga)).toEqual([1, 2, 3, 2, 3, 3, 4]);
    expect(paddingCartaPercorso(2)).toBeGreaterThan(paddingCartaPercorso(3));
  });

  it("la stima dell'altezza è quella vera, a pochi punti (quattro fasi da tre passaggi)", async () => {
    const pagina = paginaDelPercorso(await leggi(await datiDi()))!;
    // Dal fondo della testata (quota 731 dal basso) all'ultimo passaggio, più il bordo basso della carta (20) e lo scarto del testo nel pallino.
    const ultimo = Math.min(...pagina.voci.filter((v) => v.y > 95 && v.y < 731).map((v) => v.y));
    const vera = 731 - ultimo + 20 + 7;
    const stima = altezzaPercorsoAmpio({
      titolo: "Dalle scelte alla consegna",
      sottotitolo: "Le fasi del tuo intervento. Date e disponibilità si concordano nell'offerta.",
      fasi: [["Rilievo", ["Misure e supporti", "Esigenze degli ambienti", "Aperture e ingombri"]], ["Scelta", ["Telaio e vetro", "Ferramenta e finiture", "Lavorazioni di posa"]],
        ["Conferma", ["Schede approvate", "Prezzo e condizioni", "Tempi concordati"]], ["Consegna", ["Posa e regolazioni", "Prova delle aperture", "Documenti e cura"]]]
        .map(([nome, step]) => ({ nome: nome as string, step: step as string[] })),
    });
    expect(Math.abs(stima - vera), `stima ${stima.toFixed(0)} contro ${vera.toFixed(0)}`).toBeLessThan(14);
  });

  it("cinque e sei fasi stanno su un solo foglio (a due per riga la quinta finiva da sola sul foglio dopo)", async () => {
    for (const fasi of [5, 6]) {
      const pagine = await leggi(await datiDi({ percorso: { fasi } }));
      const pagina = paginaDelPercorso(pagine)!;
      // «Fase 5» è scritto due volte (etichetta spaziata e nome in maiuscolo): in piatto si trova comunque.
      expect(piatto(pagina.testo), `fase ${fasi} sul foglio del percorso`).toContain(`fase${fasi}`);
      expect(piatto(pagina.testo)).toContain("passaggio3");
    }
  });

  it("con la foto sotto le fasi (un modello d'azienda) le carte restano strette, da 8,5 punti", async () => {
    const pagine = await leggi(await datiDi({ azienda: true }));
    const pagina = paginaDelPercorso(pagine)!;
    const passaggi = testoDeiPassaggi(pagina);
    expect(passaggi.length).toBeGreaterThan(0);
    for (const v of passaggi) expect(v.corpo, `«${v.testo}»`).toBeLessThan(9);
  });

  it("le carte hanno il colore del modello, non il blu notte di serie (che resta ai modelli d'azienda)", async () => {
    const BLU_NOTTE = "#0f172a";
    const usi = (p: PaginaLetta, colore: string) => p.fill.filter((c) => c === colore).length;
    for (const modulo of ["finestre", "porte-ingresso", "porte-interne"] as SerramentiTemplateModuleId[]) {
      const colore = String(createFullSerramentiTemplate({ company_id: "qa", ragione_sociale: AZIENDA }, modulo).colore_primario).toLowerCase();
      const pagina = paginaDelPercorso(await leggi(await datiDi({ modulo })))!;
      expect(usi(pagina, colore), `${modulo}: le quattro carte nel colore del modello`).toBeGreaterThanOrEqual(4);
      // Il blu notte resta solo sul testo del titolo (due usi), non sulle carte.
      expect(usi(pagina, BLU_NOTTE), `${modulo}: nessuna carta blu notte`).toBeLessThanOrEqual(3);
    }
    const azienda = paginaDelPercorso(await leggi(await datiDi({ azienda: true })))!;
    expect(usi(azienda, BLU_NOTTE), "modello d'azienda: quattro carte blu notte più il testo").toBeGreaterThanOrEqual(6);
  });
});

describe("modelli d'intervento: la proposta sta su una pagina", () => {
  it("nei portoni garage l'ultimo punto di «Perché …» non finisce solo sul foglio dopo (la pagina sbordava di 4 punti)", async () => {
    const pagine = await leggi(await datiDi({ modulo: "portoni-garage" }));
    const proposta = pagine.find((p) => piatto(p.testo).includes("propostadiintervento"));
    expect(proposta, "la pagina della proposta").toBeTruthy();
    expect(proposta!.testo).toContain("Consegna con prova di apertura e sblocco manuale");
  });

  it("in nessuno dei nove modelli una pagina del corpo resta con una riga sola", async () => {
    for (const modulo of FULL_SERRAMENTI_MODULES) {
      const pagine = await leggi(await datiDi({ modulo, righe: 6 }));
      // La copertina è la prima; le altre hanno almeno qualche riga di testo oltre alla testata e al piè di pagina.
      const povere = pagine.slice(1).filter((p) => p.voci.filter((v) => v.y > 95 && v.y < 731).length < 4).map((p) => p.numero);
      expect(povere, `${modulo}: pagine quasi vuote`).toEqual([]);
    }
  });
});

describe("modelli d'intervento: le didascalie delle foto sono da 8 punti", () => {
  it("«Immagine illustrativa…» sotto le foto dei capitoli non scende sotto gli 8 punti", async () => {
    const pagine = await leggi(await datiDi());
    const didascalie = pagine.flatMap((p) => p.voci).filter((v) => /^Immagine illustrativa/.test(v.testo));
    expect(didascalie.length, "didascalie trovate").toBeGreaterThan(0);
    for (const d of didascalie) expect(d.corpo).toBeGreaterThanOrEqual(8);
  });
});
