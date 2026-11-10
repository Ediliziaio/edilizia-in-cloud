/// <reference types="node" />
/**
 * Rapportino e fine lavori col piè proprio (10/11/2026). Impresa Vulcano ha le quattro righe dell'esempio del
 * titolare in EB Garamond, centrate, e sotto «Pag. n / m»; «Rif./Generato» resta, piccolo, sopra il piè. Se il
 * carattere non arriva il documento esce lo stesso, in Times. Ogni altra azienda ha lo stesso PDF di prima, byte per
 * byte: le impronte qui sotto sono quelle del renderer prima della modifica.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDict, PDFDocument, PDFName, PDFPage } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { modelloPdfStandard } from "@/lib/modelliPdf/catalogo";
import { personalizzazioneDocumento, testoRigaPiede } from "../../../supabase/functions/_shared/personalizzazioneDocumenti";

// Caricato per percorso in una variabile: il modulo importa da esm.sh, che il controllo dei tipi dell'app non segue.
const PERCORSO = "../../../supabase/functions/genera-pdf-rapportino/render";
const { renderRapportino } = await import(/* @vite-ignore */ PERCORSO);

const VULCANO = "7c87c209-7868-42d0-ad98-6c95ac6de196";
const ALFA = "11111111-1111-4111-8111-111111111111";
const RIGHE = personalizzazioneDocumento(VULCANO).piedeRighe!;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function contesto(companyId: string, fine: boolean, nome: string) {
  return {
    report: {
      id: "00000000-0000-4000-8000-000000000001", company_id: companyId, stato: "bozza", data_lavoro: "2026-11-06",
      lavoro_completato: fine, ore_lavorate: 8, presenze: [{ nome: "Mario Rossi", ore: 8 }],
      // Lungo abbastanza da andare su due pagine: il piè va su ognuna e il fondo del contenuto conta.
      descrizione_lavori: "Posa e controllo dei materiali, preparazione delle superfici e verifica delle lavorazioni eseguite. ".repeat(60),
    },
    company: {
      id: companyId, name: nome, legal_address: "Via Test 42", legal_city: "Milano", legal_postal_code: "20100",
      legal_province: "MI", vat_number: "01234567890", phone: "02 1234567", email: "alfa@esempio.invalid",
    },
    branding: { primaryColor: "#123456" }, phases: [] as unknown[], punches: [] as unknown[], warnings: [] as string[],
    revision: "QA", generatedAt: "2026-11-06T12:00:00Z",
    modelloPdf: modelloPdfStandard(fine ? "fine_lavori" : "rapportino"),
  };
}

async function caratteri(bytes: Uint8Array): Promise<string[]> {
  const doc = await PDFDocument.load(bytes);
  return doc.context.enumerateIndirectObjects()
    .map(([, o]) => (o instanceof PDFDict ? o.get(PDFName.of("BaseFont"))?.toString() : undefined))
    .filter((n): n is string => !!n);
}

async function testoDellePagine(bytes: Uint8Array): Promise<string[]> {
  const pdf = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
  const pagine: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const t = await (await pdf.getPage(i)).getTextContent();
    pagine.push(t.items.map((x) => ("str" in x ? x.str : "")).join("\n"));
  }
  return pagine;
}

const fontVero = () => vi.stubGlobal("fetch", vi.fn(async (): Promise<Response> => new Response(await readFile(path.resolve("public/fonts/EBGaramond-Regular.ttf")))));

describe("Piè proprio di Impresa Vulcano su rapportino e fine lavori", () => {
  it.each([false, true])("quattro righe in EB Garamond, la pagina sotto, il contenuto sopra (fine lavori: %s)", async (fine) => {
    fontVero();
    const spy = vi.spyOn(PDFPage.prototype, "drawText");
    const r = await renderRapportino(contesto(VULCANO, fine, "Impresa Vulcano s.r.l."), async (): Promise<null> => null);
    expect(r.pageCount).toBe(2);

    const scritti = spy.mock.calls.map(([t, o]) => ({ t, y: o?.y ?? 0, size: o?.size ?? 0 }));
    // Le righe stanno nella fascia bassa (la ragione sociale c'è anche nella testata, in alto).
    for (const riga of RIGHE) for (const parte of riga.parti) expect(scritti.filter((s) => s.t === parte.testo && s.y < 60)).toHaveLength(r.pageCount);
    for (let p = 1; p <= r.pageCount; p++) expect(scritti.map((s) => s.t)).toContain(`Pag. ${p} / ${r.pageCount}`);
    // Niente più le due righe dei dati azienda né il vecchio «1 / 2» a destra.
    expect(scritti.some((s) => s.t.includes("Via Test 42"))).toBe(false);
    expect(scritti.map((s) => s.t)).not.toContain(`1 / ${r.pageCount}`);
    // Rif./Generato restano, sopra il piè; sotto di loro c'è solo il piè.
    const rif = scritti.filter((s) => s.t.startsWith("Rif. 00000000 | Edizione QA"));
    expect(rif).toHaveLength(r.pageCount);
    const yRif = rif[0].y;
    const piede = new Set([...RIGHE.flatMap((rr) => rr.parti.map((p) => p.testo)), ...Array.from({ length: r.pageCount }, (_, i) => `Pag. ${i + 1} / ${r.pageCount}`)]);
    for (const s of scritti.filter((x) => x.y < yRif)) expect(piede.has(s.t)).toBe(true);
    // Il contenuto (tutto ciò che non è piè né Rif/Generato) resta almeno 8 punti sopra la riga del Rif.
    const contenuto = scritti.filter((s) => !piede.has(s.t) && !s.t.startsWith("Rif. 00000000") && !s.t.startsWith("Generato "));
    expect(Math.min(...contenuto.map((s) => s.y))).toBeGreaterThan(yRif + 8);

    // Il carattere incorporato è EB Garamond (sottoinsieme), e il «–» resta un trattino lungo.
    expect((await caratteri(r.bytes)).some((n) => n.includes("EBGaramond"))).toBe(true);
    const testi = await testoDellePagine(r.bytes);
    for (const t of testi) {
      expect(t).toContain(testoRigaPiede(RIGHE[1]));
      expect(t).toContain("Impresa Vulcano s.r.l.");
    }
    expect(r.bytes.length).toBeLessThan(60_000);
  });

  it("se il carattere non si scarica il documento esce in Times, con le stesse righe", async () => {
    vi.stubGlobal("fetch", vi.fn(async (): Promise<Response> => { throw new Error("rete giù"); }));
    // Il carattere scaricato resta in memoria per il modulo: qui ne serve uno nuovo, che non l'ha mai avuto.
    vi.resetModules();
    const { renderRapportino: renderNuovo } = await import(/* @vite-ignore */ PERCORSO);
    const spy = vi.spyOn(PDFPage.prototype, "drawText");
    const r = await renderNuovo(contesto(VULCANO, false, "Impresa Vulcano s.r.l."), async (): Promise<null> => null);
    const testi = spy.mock.calls.map(([t]) => t);
    for (const riga of RIGHE) for (const parte of riga.parti) expect(testi).toContain(parte.testo);
    const nomi = await caratteri(r.bytes);
    expect(nomi.some((n) => n.includes("Times-Roman"))).toBe(true);
    expect(nomi.some((n) => n.includes("EBGaramond"))).toBe(false);
    expect((await testoDellePagine(r.bytes))[0]).toContain(testoRigaPiede(RIGHE[1]));
  });
});

describe("Le altre aziende: rapportino e fine lavori identici a prima", () => {
  // sha256 dei PDF del renderer prima del piè proprio (origin/main 5bd7e7a68), stessa data di sistema.
  const PRIMA = {
    rapportino: "eea63b69c9e71b1d9b01b95eb302d118599b096eba01f7259c9b5a9028251bba",
    fine_lavori: "7208f154b3d2fd24352e02e50d359888ec37ce7ba92c9ba7fcece5e7fd479830",
  };
  it.each([false, true])("stesso PDF byte per byte (fine lavori: %s)", async (fine) => {
    fontVero();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-10T08:00:00Z"));
    const r = await renderRapportino(contesto(ALFA, fine, "Impresa Alfa"), async (): Promise<null> => null);
    expect(createHash("sha256").update(r.bytes).digest("hex")).toBe(fine ? PRIMA.fine_lavori : PRIMA.rapportino);
    expect(fetch).not.toHaveBeenCalled();
  });
});
