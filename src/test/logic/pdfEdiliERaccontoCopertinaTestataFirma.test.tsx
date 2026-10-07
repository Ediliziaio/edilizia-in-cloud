/// <reference types="node" />
/**
 * I PDF dei preventivi edili e quelli «racconto» (Conto Termico 3.0, Casa Full Electric) dopo le richieste di
 * Renova (05/10/2026, valgono per tutti i preventivi):
 *  - la pagina da firmare si chiama «ACCETTAZIONE PROPOSTA»;
 *  - in testata di ogni pagina c'è l'azienda e il numero del preventivo, non il nome del cliente;
 *  - in copertina niente «A cura di» e, col logo, non si ripete il nome dell'azienda (senza logo il nome resta).
 * Renderer vero, offline: si legge il testo del PDF come lo legge il cliente.
 */
import { renderToBuffer } from "@react-pdf/renderer/lib/react-pdf.js";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 240_000 });

vi.mock("@/integrations/supabase/client", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const catena: any = new Proxy({}, {
    get: (_t, nome) => (nome === "then"
      ? (ok: (v: unknown) => unknown) => Promise.resolve({ data: [] as unknown[], error: null as null }).then(ok)
      : () => catena),
  });
  const nulla = (): Promise<{ data: null; error: null }> => Promise.resolve({ data: null, error: null });
  return {
    supabase: {
      from: () => catena, rpc: nulla, functions: { invoke: nulla },
      storage: { from: () => ({ createSignedUrl: nulla, createSignedUrls: () => Promise.resolve({ data: [] as unknown[], error: null }), getPublicUrl: () => ({ data: { publicUrl: "" } }) }) },
      auth: { getSession: () => Promise.resolve({ data: { session: null } }) },
    },
  };
});
vi.mock("@/lib/serramenti/pdfImageUtils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/serramenti/pdfImageUtils")>()),
  // I file di `public/` come immagini già incorporate; gli indirizzi che non sono nostri non si scaricano.
  toDataUrl: async (url: string | null): Promise<string | null> => {
    if (!url || url.startsWith("data:")) return url;
    if (!url.startsWith("/")) return null;
    const bytes = await readFile(path.resolve("public", url.slice(1)));
    return `data:image/png;base64,${bytes.toString("base64")}`;
  },
}));

import { enrichClimatizzazionePdf } from "@/hooks/useClimatizzazionePDF";
import { costruisciDatiEdile } from "@/components/preventivi/pdf/adattatoreEdile";
import { DocumentoEdilePDF } from "@/components/preventivi/pdf/DocumentoEdilePDF";
import { MODULI_EDILI } from "@/components/preventivi/pdf/moduliEdili";
import { ContoTermicoPDF } from "@/components/termoidraulico/contoTermico/ContoTermicoPDF";
import { anteprimaContoTermico } from "@/lib/contoTermico/anteprima";
import { FullElectricPDF } from "@/components/termoidraulico/fullElectric/FullElectricPDF";
import { anteprimaFullElectric } from "@/lib/fullElectric/anteprima";

/** Una pagina del PDF: tutto il testo, e solo quello della testata (la fascia in alto, sopra il contenuto). */
interface Pagina { testo: string; testata: string }

async function pagineDi(elemento: Parameters<typeof renderToBuffer>[0], sogliaTestata: number): Promise<Pagina[]> {
  const bytes = await renderToBuffer(elemento);
  const doc = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
  const pagine: Pagina[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const oggetti = (await (await doc.getPage(i)).getTextContent()).items.filter((x) => "str" in x) as Array<{ str: string; transform: number[] }>;
    pagine.push({
      testo: oggetti.map((x) => x.str).join(" ").replace(/\s+/g, " "),
      testata: oggetti.filter((x) => x.transform[5] > sogliaTestata).map((x) => x.str).join(" ").replace(/\s+/g, " "),
    });
  }
  return pagine;
}

/** Il testo senza spazi e in minuscolo: il nome in copertina può essere spaziato lettera per lettera. */
const piatto = (s: string) => s.replace(/\s+/g, "").toLowerCase();
const LOGO_PUBLIC = "/icons/icon-192.png";
let logoData: string | null = null;
async function logoComeDati(): Promise<string> {
  logoData ??= `data:image/png;base64,${(await readFile(path.resolve("public", LOGO_PUBLIC.slice(1)))).toString("base64")}`;
  return logoData;
}

// ─── Il documento edile (Climatizzazione, come tutti gli altri moduli edili) ──────────────────────────────────────

const voce = (id: string, q: number, prezzo: number, ordine: number) => ({
  id, progetto_id: "p1", company_id: "c1", capitolo_nome: "Opere", descrizione: `Voce ${id}`, unita_misura: "mq", quantita: q,
  prezzo_unitario: prezzo, costo_materiali: 0, costo_manodopera: 0, sconto_pct: 0, importo: 0, margine_eur: 0, margine_pct: 0,
  listino_voce_id: null as string | null, fonte: null as string | null, ordine,
});

async function pdfEdile(opts: { logo: boolean }): Promise<Pagina[]> {
  const e = await enrichClimatizzazionePdf({
    progetto: { id: "p1", company_id: "c1", code: "CLM-1", detrazione_pct: 0, cliente_nome: "Mario", cliente_cognome: "Rossi" } as never,
    computo: [voce("a", 10, 100, 0)] as never, media: [],
    template: { company_id: "c1", show_chi_siamo: false } as never,
    company: { name: "Bianchi", logo_url: opts.logo ? LOGO_PUBLIC : null },
  });
  const dati = costruisciDatiEdile({
    modulo: MODULI_EDILI.climatizzazione, progetto: e.progetto as never, template: e.template as never, azienda: e.company,
    capitoli: e.capitoli as never, totali: e.totali, media: [],
  });
  return pagineDi(<DocumentoEdilePDF dati={dati} />, 770);
}

describe("preventivo edile: copertina, testata e pagina della firma", () => {
  it("col logo: in copertina né il nome dell'azienda né «A cura di»; senza logo il nome resta", async () => {
    const [conLogo] = await pdfEdile({ logo: true });
    expect(piatto(conLogo.testo).includes("bianchi"), "il nome accanto al logo").toBe(false);
    expect(conLogo.testo.includes("A cura di")).toBe(false);
    const [senzaLogo] = await pdfEdile({ logo: false });
    expect(piatto(senzaLogo.testo).includes("bianchi"), "il nome al posto del logo").toBe(true);
  });

  it("testata di ogni pagina: il tipo di piano e il numero, mai il nome del cliente", async () => {
    const pagine = await pdfEdile({ logo: true });
    const interne = pagine.slice(1);
    expect(interne.length).toBeGreaterThan(3);
    for (const [i, p] of interne.entries()) {
      expect(piatto(p.testata).includes("pianodeilavori"), `testata della pagina ${i + 2}: «${p.testata}»`).toBe(true);
      expect(/Mario|Rossi/.test(p.testata), `il cliente nella testata della pagina ${i + 2}: «${p.testata}»`).toBe(false);
    }
  });

  it("la pagina da firmare è «ACCETTAZIONE PROPOSTA»", async () => {
    const documento = (await pdfEdile({ logo: true })).map((p) => p.testo).join(" ");
    expect(piatto(documento).includes("accettazioneproposta"), "il titolo nuovo").toBe(true);
    expect(piatto(documento).includes("firmadelcontratto"), "il titolo vecchio").toBe(false);
  });
});

// ─── I documenti «racconto»: Conto Termico 3.0 e Casa Full Electric ──────────────────────────────────────────────────

async function pdfConto(opts: { logo: boolean }): Promise<Pagina[]> {
  const d = anteprimaContoTermico({});
  if (opts.logo) d.azienda.logoUrl = await logoComeDati();
  return pagineDi(<ContoTermicoPDF data={d} />, 790);
}

describe("Conto Termico 3.0: copertina, testata e pagina della firma", () => {
  it("col logo: in copertina resta la descrizione, non il nome dell'azienda, e niente «A cura di»", async () => {
    const [copertina] = await pdfConto({ logo: true });
    expect(copertina.testo.includes("Riscaldamento con il Conto Termico 3.0"), "la descrizione accanto al logo").toBe(true);
    expect(copertina.testo.includes("La tua azienda"), "il nome accanto al logo").toBe(false);
    expect(copertina.testo.includes("A cura di")).toBe(false);
  });

  it("senza logo: il nome dell'azienda resta in copertina", async () => {
    const [copertina] = await pdfConto({ logo: false });
    expect(copertina.testo.includes("La tua azienda")).toBe(true);
    expect(copertina.testo.includes("A cura di")).toBe(false);
  });

  it("testata di ogni pagina: azienda e codice del preventivo, mai il nome del cliente", async () => {
    const pagine = await pdfConto({ logo: false });
    const interne = pagine.slice(1);
    expect(interne.length).toBeGreaterThan(3);
    for (const [i, p] of interne.entries()) {
      expect(p.testata.includes("La tua azienda") && p.testata.includes("CT-ESEMPIO"), `testata della pagina ${i + 2}: «${p.testata}»`).toBe(true);
      expect(/Mario|Rossi/.test(p.testata), `il cliente nella testata della pagina ${i + 2}: «${p.testata}»`).toBe(false);
    }
  });

  it("la pagina da firmare è «ACCETTAZIONE PROPOSTA»", async () => {
    const documento = (await pdfConto({ logo: false })).map((p) => p.testo).join(" ");
    expect(piatto(documento).includes("accettazioneproposta"), "il titolo nuovo").toBe(true);
    // (Il passo «Firma della proposta» dell'elenco «come funziona» è un'altra cosa: non è il titolo della pagina.)
    expect(piatto(documento).includes("firmadelcontratto"), "il titolo vecchio").toBe(false);
  });
});

describe("Casa Full Electric: copertina, testata e pagina della firma", () => {
  it("col logo niente nome dell'azienda né «A cura di»; testata senza cliente; firma «ACCETTAZIONE PROPOSTA»", async () => {
    const d = anteprimaFullElectric({});
    d.azienda.logoUrl = await logoComeDati();
    const pagine = await pagineDi(<FullElectricPDF data={d} />, 790);
    expect(pagine[0].testo.includes(d.azienda.nome), "il nome accanto al logo").toBe(false);
    expect(pagine[0].testo.includes("A cura di")).toBe(false);
    for (const [i, p] of pagine.slice(1).entries()) {
      expect(p.testata.includes(d.cliente.nome), `il cliente nella testata della pagina ${i + 2}: «${p.testata}»`).toBe(false);
    }
    const documento = pagine.map((p) => p.testo).join(" ");
    expect(piatto(documento).includes("accettazioneproposta")).toBe(true);
  });
});
