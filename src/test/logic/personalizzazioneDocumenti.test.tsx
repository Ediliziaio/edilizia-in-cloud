/// <reference types="node" />
/**
 * La veste dei PDF per azienda (09/11/2026): Impresa Vulcano ha logo grande e piè in EB Garamond blu scuro, dal
 * 10/11/2026 con le quattro righe dell'esempio del titolare; le altre restano identiche. Renderer vero: se PDF_PROVA_DIR è impostata, il PDF di prova resta lì.
 */
import { renderToBuffer } from "@react-pdf/renderer/lib/react-pdf.js";
import { OPS, getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  SENZA_PERSONALIZZAZIONE, margineInferiorePiede, misurePiede, personalizzazioneDocumento, testoRigaPiede,
} from "../../../supabase/functions/_shared/personalizzazioneDocumenti";

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
  toDataUrl: async (url: string | null): Promise<string | null> => {
    if (!url || url.startsWith("data:")) return url;
    if (url.startsWith(window.location.origin + "/")) url = new URL(url).pathname;
    if (!url.startsWith("/")) return null;
    const bytes = await readFile(path.resolve("public", url.slice(1)));
    return `data:image/${bytes[0] === 0x89 ? "png" : "jpeg"};base64,${bytes.toString("base64")}`;
  },
}));

import { enrichRistrutturazionePdf } from "@/hooks/useRistrutturazionePDF";
import { RistrutturazionePDF } from "@/components/ristrutturazione/RistrutturazionePDF";
import { buildRstModulePreview, createFullRstTemplate } from "@/lib/moduli-vendita/fullRstModules";
import type { RstTemplatePdf } from "@/types/ristrutturazione";
import { CHIAVE_ARCHIVIO } from "../../../supabase/functions/_shared/condizioniArchivio";

const VULCANO = "7c87c209-7868-42d0-ad98-6c95ac6de196";
const ALTRA = "11111111-2222-4333-8444-555555555555";
const LOGO = "/loghi/impresa-vulcano.png";

describe("numero automatico del preventivo con computo", () => {
  it("c'è solo per Impresa Vulcano", () => {
    expect(personalizzazioneDocumento("7c87c209-7868-42d0-ad98-6c95ac6de196").numeroAutomaticoComputo).toBe(true);
    expect(personalizzazioneDocumento("00000000-0000-4000-8000-000000000001").numeroAutomaticoComputo).toBeFalsy();
  });
});

describe("personalizzazioneDocumento", () => {
  it("Vulcano ha logo grande e piè in EB Garamond blu scuro", () => {
    expect(personalizzazioneDocumento(VULCANO)).toMatchObject({ logoAltezza: 55, logoLarghezzaMax: 340, piedeFont: "EB Garamond", piedeColore: "#1C1650" });
  });
  it.each([[ALTRA], [null], [undefined], [""], ["preview"]])("%s: valore neutro", (id) => {
    expect(personalizzazioneDocumento(id)).toBe(SENZA_PERSONALIZZAZIONE);
    expect(Object.values(SENZA_PERSONALIZZAZIONE).every((v) => v === null)).toBe(true);
    expect(misurePiede(personalizzazioneDocumento(id), 495)).toBeNull();
    expect(margineInferiorePiede(id, 72)).toBe(72);
  });
  it("Renova: copertina chiara col suo logo senza riquadro, grande; pagine interne e piè come sempre", () => {
    const v = personalizzazioneDocumento("f2a16dd8-36c3-4d92-8d78-267d6374dcb5");
    expect(v).toMatchObject({ logoCopertinaAltezza: 100, logoCopertinaLarghezzaMax: 260, logoAltezza: null, piedeFont: null, piedeRighe: null });
    expect(v.logoCopertinaUrl).toMatch(/^data:image\/png;base64,/);
    expect(v.copertina).toMatchObject({ fondo: "#FFFFFF", testo: "#1F2937" });
    expect(misurePiede(v, 495)).toBeNull();
    expect(margineInferiorePiede("f2a16dd8-36c3-4d92-8d78-267d6374dcb5", 72)).toBe(72);
  });
  it("Vulcano ha le quattro righe dell'esempio, scritte così, la prima come titolo e l'email azzurra sottolineata", () => {
    const v = personalizzazioneDocumento(VULCANO);
    expect(v.piedeRighe!.map(testoRigaPiede)).toEqual(PIEDE_VULCANO);
    expect(v.piedeRighe!.map((r) => Boolean(r.titolo))).toEqual([true, false, false, false]);
    expect(v.piedeRighe![2].parti[0]).toEqual({ testo: "info@impresavulcano.it", colore: "#3B82C4", sottolineato: true });
  });
  it("le misure: titolo 10,5, righe 7 finché la più lunga ci sta, poi scendono; il margine copre il piè", () => {
    const v = personalizzazioneDocumento(VULCANO);
    expect(misurePiede(v, 495)).toMatchObject({ corpoTitolo: 10.5, corpo: 7 });
    expect(misurePiede(v, 300)!.corpo).toBeLessThan(7);
    expect(misurePiede(v, 300)!.corpo * 43.3).toBeLessThanOrEqual(300);
    const m = misurePiede(v, 495)!;
    expect(margineInferiorePiede(VULCANO, 72)).toBeGreaterThanOrEqual(m.ingombro + 8);
    expect(margineInferiorePiede(VULCANO, 120)).toBe(120);
  });
});

const PIEDE_VULCANO = [
  "Impresa Vulcano s.r.l.",
  "Sede Legale: Via Marconi, 35 – Lonate Pozzolo (VA) / Sede Operativa: Via dei Mille, 3 – Vanzaghello (MI)",
  "info@impresavulcano.it - www.impresavulcano.it",
  "C.F./P.IVA 06923340969    tel. 0331/1409144",
];

interface Foglio { numero: number; loghi: Array<{ cima: number; fondo: number; larghezza: number }>; testi: Array<{ cima: number; base: number; testo: string; font: string }> }

type Matrice = [number, number, number, number, number, number];
const molt = (a: Matrice, b: Matrice): Matrice => [
  b[0] * a[0] + b[1] * a[2], b[0] * a[1] + b[1] * a[3], b[2] * a[0] + b[3] * a[2],
  b[2] * a[1] + b[3] * a[3], b[4] * a[0] + b[5] * a[2] + a[4], b[4] * a[1] + b[5] * a[3] + a[5],
];

async function fogli(bytes: Uint8Array): Promise<Foglio[]> {
  const pdf = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
  const out: Foglio[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const pagina = await pdf.getPage(n);
    const alto = pagina.getViewport({ scale: 1 }).height;
    const ops = await pagina.getOperatorList();
    let ctm: Matrice = [1, 0, 0, 1, 0, 0];
    const pila: Matrice[] = [];
    const loghi: Foglio["loghi"] = [];
    ops.fnArray.forEach((fn, i) => {
      if (fn === OPS.save) pila.push(ctm);
      else if (fn === OPS.restore) ctm = pila.pop() ?? ctm;
      else if (fn === OPS.transform) ctm = molt(ctm, ops.argsArray[i] as Matrice);
      else if (fn === OPS.paintImageXObject) {
        const a = alto - ctm[5]; const b = alto - (ctm[5] + ctm[3]);
        loghi.push({ cima: Math.min(a, b), fondo: Math.max(a, b), larghezza: Math.abs(ctm[0]) });
      }
    });
    const stili = (await pagina.getTextContent()).styles;
    const testo = await pagina.getTextContent();
    const testi = (testo.items.filter((x) => "str" in x && x.str.trim()) as Array<{ str: string; transform: number[]; fontName: string; height: number }>)
      .map((t) => ({ cima: alto - t.transform[5] - Math.abs(t.transform[3]), base: alto - t.transform[5], testo: t.str, font: stili[t.fontName]?.fontFamily ?? t.fontName }));
    out.push({ numero: n, loghi, testi });
  }
  return out;
}

async function documento(companyId: string): Promise<Uint8Array> {
  const base = { id: "online", company_id: companyId, default_iva_pct: 10, ragione_sociale: "Impresa Vulcano S.r.l.", logo_url: LOGO } as unknown as RstTemplatePdf;
  const template = createFullRstTemplate(base, "completa");
  const anteprima = buildRstModulePreview(companyId, template, "completa");
  const enriched = await enrichRistrutturazionePdf({ ...anteprima, company: { name: "Impresa Vulcano S.r.l.", logo_url: LOGO } } as never);
  // Il client finto non legge i dati societari: quelli veri del piè arrivano col documento.
  (enriched as unknown as { template: Record<string, unknown> }).template[CHIAVE_ARCHIVIO] = {
    ...(enriched as unknown as { template: Record<string, Record<string, unknown>> }).template[CHIAVE_ARCHIVIO],
    societari: { ragioneSociale: "Impresa Vulcano S.r.l.", sede: "Via Roma 1, 20100 Milano (MI)", partitaIva: "01234567890", capitale_sociale: 10000, forma_giuridica: "SRL" },
  };
  return new Uint8Array(await renderToBuffer(<RistrutturazionePDF {...(enriched as unknown as ComponentProps<typeof RistrutturazionePDF>)} />));
}

/** Il font dal disco, al posto della rete. */
function fontDaDisco() {
  const vero = globalThis.fetch;
  vi.stubGlobal("fetch", async (url: unknown, opzioni?: RequestInit) => {
    if (!String(url).includes("EBGaramond")) return vero(url as RequestInfo, opzioni);
    return new Response(new Uint8Array(await readFile(path.resolve("public/fonts/EBGaramond-Regular.ttf"))));
  });
}

describe("documento edile", () => {
  it("per Vulcano il logo è grande, non copre il contenuto e il piè esce in EB Garamond", async () => {
    fontDaDisco();
    const bytes = await documento(VULCANO);
    vi.unstubAllGlobals();
    if (process.env.PDF_PROVA_DIR) await writeFile(path.join(process.env.PDF_PROVA_DIR, "vulcano-documento-edile.pdf"), bytes);
    const pagine = await fogli(bytes);
    expect(pagine.length).toBeGreaterThan(3);
    // Prima pagina: copertina, a 460 punti.
    expect(Math.max(...pagine[0].loghi.map((l) => l.larghezza))).toBeGreaterThan(400);
    const interne = pagine.slice(1).filter((p) => p.loghi.some((l) => l.cima < 40 && l.larghezza > 300));
    expect(interne.length, "pagine con la testata grande").toBeGreaterThan(2);
    for (const p of interne) {
      const logo = p.loghi.find((l) => l.cima < 40 && l.larghezza > 300)!;
      expect(logo.fondo - logo.cima).toBeGreaterThan(50);
      // Tutto il testo, riferimento del preventivo compreso, sta sotto il logo.
      expect(Math.min(...p.testi.map((t) => t.cima)), `p.${p.numero}: testo sopra il fondo del logo`).toBeGreaterThanOrEqual(logo.fondo - 0.5);
    }
    expect(Buffer.from(bytes).includes("EBGaramond"), "il carattere è nel file").toBe(true);
  });

  it("per Vulcano il piè è quello dell'esempio, su ogni pagina interna, e il contenuto non lo tocca", async () => {
    fontDaDisco();
    const pagine = await fogli(await documento(VULCANO));
    vi.unstubAllGlobals();
    const cimaPiede = 841.89 - misurePiede(personalizzazioneDocumento(VULCANO), 595.28 - 2 * 48)!.ingombro;
    const delPiede = (t: Foglio["testi"][number]) => t.cima >= cimaPiede - 1;
    for (const p of pagine.slice(1)) {
      const piede = p.testi.filter(delPiede).map((t) => t.testo).join(" ").replace(/\s+/g, " ");
      for (const r of PIEDE_VULCANO) expect(piede, `p.${p.numero}`).toContain(r.replace(/\s+/g, " ").slice(0, 20));
      expect(piede).toContain("www.impresavulcano.it");
      expect(piede).toContain("tel. 0331/1409144");
      expect(piede).toMatch(/Pag\. \d+ \/ \d+/);
      expect(piede, "i dati societari di prima non ci sono più").not.toContain("Capitale sociale");
      // Il contenuto finisce sopra il piè, con un po' di bianco.
      const contenuto = p.testi.filter((t) => !delPiede(t));
      if (contenuto.length) expect(Math.max(...contenuto.map((t) => t.base)), `p.${p.numero}: contenuto sul piè`).toBeLessThan(cimaPiede - 2);
    }
  });

  it("per un'altra azienda niente cambia: logo piccolo e stessa impaginazione di chi non ha azienda", async () => {
    const bytes = await documento(ALTRA);
    expect(Buffer.from(bytes).includes("EBGaramond")).toBe(false);
    const pagine = await fogli(bytes);
    const interne = pagine.slice(1).filter((p) => p.loghi.some((l) => l.cima < 40));
    expect(interne.length).toBeGreaterThan(2);
    for (const p of interne) {
      const logo = p.loghi.find((l) => l.cima < 40)!;
      expect(logo.fondo - logo.cima).toBeLessThan(18);
      expect(logo.larghezza).toBeLessThanOrEqual(110.5);
    }
    // Stesso numero di pagine e stesse posizioni con un'azienda qualunque.
    const altra = await fogli(await documento("99999999-2222-4333-8444-555555555555"));
    expect(altra.map((p) => p.testi.map((t) => `${Math.round(t.cima)}:${t.font}`))).toEqual(pagine.map((p) => p.testi.map((t) => `${Math.round(t.cima)}:${t.font}`)));
  });

  it("se il carattere non si scarica il documento esce lo stesso", async () => {
    vi.stubGlobal("fetch", async () => new Response("no", { status: 404 }));
    const bytes = await documento(VULCANO);
    vi.unstubAllGlobals();
    const pagine = await fogli(bytes);
    expect(pagine.length).toBeGreaterThan(3);
    expect(pagine[1].testi.some((t) => t.testo.includes("Impresa Vulcano s.r.l."))).toBe(true);
  });
});
