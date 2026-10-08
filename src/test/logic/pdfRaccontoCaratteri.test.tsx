/// <reference types="node" />
/**
 * I caratteri dei PDF «racconto» (Conto Termico 3.0, Casa Full Electric), 07/10/2026.
 * Misurati sui documenti come li riceve il cliente (foto di serie e pagine comuni comprese): la mediana era 8 punti e 8
 * caratteri su 10 stavano sotto i 9 (schede a 7,2, risposte a 8, note a 7,5, intestazioni di tabella a 7).
 * Ora le frasi si leggono a 9 punti o più; sotto i 9 restano le etichette in maiuscolo, le didascalie, la testata e il piè di pagina.
 * Renderer vero, offline.
 */
import { renderToBuffer } from "@react-pdf/renderer/lib/react-pdf.js";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { readFileSync } from "node:fs";
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

import { ContoTermicoPDF } from "@/components/termoidraulico/contoTermico/ContoTermicoPDF";
import { FullElectricPDF } from "@/components/termoidraulico/fullElectric/FullElectricPDF";
import { datiPdfContoTermico, fotoDelPreventivo } from "@/lib/contoTermico/pdfDelPreventivo";
import { datiPdfFullElectric, fotoFullElectric } from "@/lib/fullElectric/pdfDelPreventivo";
import { DATI_FULL_ELECTRIC_DIMOSTRATIVI } from "@/lib/fullElectric/anteprima";
import { buildIdrModulePreview, createFullIdrTemplate } from "@/lib/moduli-vendita/fullIdrModules";
import type { IdrPdfEnriched } from "@/hooks/useTermoidraulicoPDF";
import type { IdrTemplatePdf } from "@/types/termoidraulico";

interface Voce { y: number; corpo: number; testo: string }
interface Pagina { numero: number; voci: Voce[] }

const comeDati = (url?: string | null): string | null => {
  if (!url) return null;
  const bytes = readFileSync(path.resolve("public", url.replace(/^\//, "")));
  return `data:image/${bytes[0] === 0x89 ? "png" : "jpeg"};base64,${bytes.toString("base64")}`;
};
const incorpora = (foto: Record<string, string | null | undefined>) => Object.fromEntries(Object.entries(foto).map(([k, v]) => [k, comeDati(v)]));

/** Il preventivo d'esempio come lo costruisce l'app: modello di libreria, 10% di IVA, il cliente e l'azienda del test. */
function preventivo(modello: "conto-termico" | "full-electric", totale: number, imponibile: number): IdrPdfEnriched {
  const template = createFullIdrTemplate({ id: "online", company_id: "demo", ragione_sociale: "Azienda", default_detrazione_pct: 50 } as IdrTemplatePdf, modello);
  const anteprima = buildIdrModulePreview("demo", template, modello);
  return {
    ...anteprima,
    progetto: { ...anteprima.progetto, cliente_nome: "Anna", cliente_cognome: "Bianchi", cantiere_indirizzo: "Via Verdi 3", cantiere_cap: "20100", cantiere_citta: "Milano", cantiere_provincia: "MI" },
    company: { ragione_sociale: "Impresa Demo", colore_marca: "#0f766e", website: "https://impresa.it", telefono: "+39 02 123456", email: "info@impresa.it" },
    capitoli: [{ nome: "Sistema", voci: anteprima.computo, subtotale: imponibile, costo: 0 }],
    totali: { totale, ivaPct: 10 },
    images: {},
  } as unknown as IdrPdfEnriched;
}

async function leggi(elemento: Parameters<typeof renderToBuffer>[0]): Promise<Pagina[]> {
  const bytes = await renderToBuffer(elemento);
  const pdf = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
  const pagine: Pagina[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const oggetti = (await (await pdf.getPage(i)).getTextContent()).items.filter((x) => "str" in x) as Array<{ str: string; transform: number[] }>;
    pagine.push({
      numero: i,
      voci: oggetti.filter((o) => o.str.trim()).map((o) => ({ y: Math.round(o.transform[5]), corpo: Math.round(Math.hypot(o.transform[0], o.transform[1]) * 10) / 10, testo: o.str })),
    });
  }
  return pagine;
}

const conto = () => leggi(<ContoTermicoPDF data={datiPdfContoTermico(preventivo("conto-termico", 13750, 12500), incorpora(fotoDelPreventivo("pompa_calore")) as never)} />);
const full = () => leggi(<FullElectricPDF data={datiPdfFullElectric(preventivo("full-electric", 28600, 26000), incorpora(fotoFullElectric(DATI_FULL_ELECTRIC_DIMOSTRATIVI.componenti)) as never)} />);

/** Didascalie e note a piè: possono stare sotto i 9 punti, le frasi no. */
const eDidascalia = (t: string) => /^(Immagin|Dati del|Dati dei|Fa fede|Fanno fede)/.test(t.trim());
/** Le etichette in maiuscolo hanno le lettere spaziate: arrivano come «P E R L ' I M P R E S A». */
const eSpaziata = (t: string) => /^(\S ){6,}/.test(t.trim());
/** Il corpo della pagina: fra la testata (sopra i 790 punti) e il piè di pagina (sotto i 60). */
const nelCorpo = (v: Voce) => v.y > 60 && v.y < 790;

const DOCUMENTI: Array<[string, () => Promise<Pagina[]>]> = [["Conto Termico", conto], ["Casa Full Electric", full]];

describe.each(DOCUMENTI)("%s: i caratteri", (_nome, rendi) => {
  it("le frasi si leggono a 9 punti o più (didascalie e note a piè escluse), copertina esclusa", async () => {
    const pagine = (await rendi()).slice(1);
    const frasi = pagine.flatMap((p) => p.voci.filter((v) => nelCorpo(v) && v.testo.trim().length >= 40 && !eDidascalia(v.testo) && !eSpaziata(v.testo)).map((v) => ({ ...v, pagina: p.numero })));
    expect(frasi.length, "frasi trovate").toBeGreaterThan(40);
    const piccole = frasi.filter((f) => f.corpo < 9);
    expect(piccole.map((f) => `p.${f.pagina} ${f.corpo} pt «${f.testo.slice(0, 50)}»`), "frasi sotto i 9 punti").toEqual([]);
  });

  it("la mediana è 9 punti e meno di un carattere su tre sta sotto i 9 (prima: mediana 8, otto su dieci sotto)", async () => {
    const pagine = (await rendi()).slice(1);
    const corpi = pagine.flatMap((p) => p.voci.flatMap((v) => Array.from(v.testo.replace(/\s/g, "")).map(() => v.corpo))).sort((a, b) => a - b);
    const mediana = corpi[Math.floor(corpi.length / 2)];
    const sotto = corpi.filter((c) => c < 9).length / corpi.length;
    expect(mediana).toBeGreaterThanOrEqual(9);
    expect(sotto, "quota dei caratteri sotto i 9 punti").toBeLessThan(0.33);
  });

  it("nessuna pagina è quasi vuota: con i caratteri più grandi niente sborda su un foglio nuovo (la firma ha il suo foglio)", async () => {
    const pagine = await rendi();
    const povere = pagine.slice(1, -1).filter((p) => p.voci.filter(nelCorpo).length < 8).map((p) => p.numero);
    expect(povere, "pagine con meno di otto righe di corpo").toEqual([]);
  });
});
