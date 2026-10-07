/// <reference types="node" />
/**
 * I caratteri del PDF dei preventivi edili (Ristrutturazione, Bagni, Tetti, Climatizzazione…), 07/10/2026.
 * Misurati sui dieci modelli di Ristrutturazione resi davvero, con le foto: mediana 8,5 punti e il 51–60% dei caratteri
 * sotto i 9 (descrizioni a 8 e 8,5, tabelle a 9, intestazioni a 6,5, note a 7). Ora le frasi si leggono a 9 punti o più;
 * sotto i 9 restano le etichette in maiuscolo, le didascalie, la testata e il piè di pagina.
 * Le stime d'altezza che decidono dove va una foto o un capitolo seguono i nuovi corpi: nessuna pagina in più.
 * Renderer vero, offline.
 */
import { renderToBuffer } from "@react-pdf/renderer/lib/react-pdf.js";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ComponentProps } from "react";
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
    // Le foto del modello arrivano con l'origine dell'app davanti (conOrigine): nel test sono i file di `public/`.
    if (url.startsWith(window.location.origin + "/")) url = new URL(url).pathname;
    if (!url.startsWith("/")) return null;
    const bytes = await readFile(path.resolve("public", url.slice(1)));
    return `data:image/${bytes[0] === 0x89 ? "png" : "jpeg"};base64,${bytes.toString("base64")}`;
  },
}));

import { enrichRistrutturazionePdf } from "@/hooks/useRistrutturazionePDF";
import { RistrutturazionePDF } from "@/components/ristrutturazione/RistrutturazionePDF";
import { buildRstModulePreview, createFullRstTemplate, type FullRstModuleId } from "@/lib/moduli-vendita/fullRstModules";
import type { RstTemplatePdf } from "@/types/ristrutturazione";

interface Voce { y: number; corpo: number; testo: string }
interface Pagina { numero: number; voci: Voce[] }

async function documento(modulo: FullRstModuleId): Promise<Pagina[]> {
  const base = { id: "online", company_id: "qa", default_iva_pct: 10, ragione_sociale: "Impresa esempio", logo_url: null } as unknown as RstTemplatePdf;
  const template = createFullRstTemplate(base, modulo);
  const anteprima = buildRstModulePreview("qa", template, modulo);
  const enriched = await enrichRistrutturazionePdf({ ...anteprima, company: { name: "Impresa esempio", logo_url: null } } as never);
  const bytes = await renderToBuffer(<RistrutturazionePDF {...(enriched as unknown as ComponentProps<typeof RistrutturazionePDF>)} />);
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

/** Didascalie e note a piè: possono stare sotto i 9 punti, le frasi no. */
const eDidascalia = (t: string) => /^(Immagin|Fonte:|Documento )/.test(t.trim());
/** Le etichette in maiuscolo hanno le lettere spaziate: arrivano come «P I A N O D E I L A V O R I». */
const eSpaziata = (t: string) => /^(\S ){6,}/.test(t.trim());
/** Il corpo della pagina: fra la testata (sopra i 760 punti) e il piè di pagina (sotto gli 80). */
const nelCorpo = (v: Voce) => v.y > 80 && v.y < 760;

describe.each(["completa", "cucina", "computo"] as FullRstModuleId[])("preventivo edile, modello «%s»: i caratteri", (modulo) => {
  it("le frasi si leggono a 9 punti o più (didascalie e note a piè escluse), copertina esclusa", async () => {
    const pagine = (await documento(modulo)).slice(1);
    const frasi = pagine.flatMap((p) => p.voci.filter((v) => nelCorpo(v) && v.testo.trim().length >= 40 && !eDidascalia(v.testo) && !eSpaziata(v.testo)).map((v) => ({ ...v, pagina: p.numero })));
    expect(frasi.length, "frasi trovate").toBeGreaterThan(40);
    const piccole = frasi.filter((f) => f.corpo < 9);
    expect(piccole.map((f) => `p.${f.pagina} ${f.corpo} pt «${f.testo.slice(0, 50)}»`), "frasi sotto i 9 punti").toEqual([]);
  });

  it("la mediana è almeno 9,5 punti e meno del 40% dei caratteri sta sotto i 9 (prima: 8,5 e 51–60%)", async () => {
    const pagine = (await documento(modulo)).slice(1);
    const corpi = pagine.flatMap((p) => p.voci.flatMap((v) => Array.from(v.testo.replace(/\s/g, "")).map(() => v.corpo))).sort((a, b) => a - b);
    expect(corpi[Math.floor(corpi.length / 2)]).toBeGreaterThanOrEqual(9.5);
    expect(corpi.filter((c) => c < 9).length / corpi.length, "quota dei caratteri sotto i 9 punti").toBeLessThan(0.4);
  });
});

describe("preventivo edile: le stime d'altezza seguono i corpi", () => {
  it("con i caratteri più grandi il documento ha le stesse pagine di prima (15 per il modello completo, 16 con le aperture portanti)", async () => {
    expect((await documento("completa")).length).toBe(15);
    expect((await documento("aperture-portanti")).length).toBe(16);
  });
});
