/// <reference types="node" />
/**
 * I numeri che il PDF del preventivo edile stampa davvero (06/10/2026): si rende il documento
 * con il renderer vero, offline, e si leggono le cifre dal testo del PDF.
 *  - Nel blocco dell'investimento le cifre si sommano: lordo − sconto = imponibile netto,
 *    imponibile netto + IVA = totale, tutte a centesimi.
 *  - Le percentuali si scrivono all'italiana: «Sconto 7,5%», «TAN 9,9%», non «7.5%» col punto,
 *    e senza perdere decimali («7,25%», non «7,3%», mentre l'importo è calcolato sul 7,25).
 */
import { renderToBuffer } from "@react-pdf/renderer/lib/react-pdf.js";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 120_000 });

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
  toDataUrl: async (): Promise<string | null> => null,
}));

import { enrichClimatizzazionePdf } from "@/hooks/useClimatizzazionePDF";
import { costruisciDatiEdile } from "@/components/preventivi/pdf/adattatoreEdile";
import { DocumentoEdilePDF } from "@/components/preventivi/pdf/DocumentoEdilePDF";
import { MODULI_EDILI } from "@/components/preventivi/pdf/moduliEdili";

async function testoDelPdf(elemento: Parameters<typeof renderToBuffer>[0]): Promise<string> {
  const bytes = await renderToBuffer(elemento);
  const doc = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
  let testo = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const pagina = await doc.getPage(i);
    testo += (await pagina.getTextContent()).items.map((x) => ("str" in x ? x.str : "")).join(" ") + "\n";
  }
  return testo.replace(/\s+/g, " ");
}

const voce = (id: string, q: number, prezzo: number, ordine: number) => ({
  id, progetto_id: "p1", company_id: "c1", capitolo_nome: "Opere", descrizione: `Voce ${id}`, unita_misura: "mq", quantita: q,
  prezzo_unitario: prezzo, costo_materiali: 0, costo_manodopera: 0, sconto_pct: 0, importo: 0, margine_eur: 0, margine_pct: 0,
  listino_voce_id: null as string | null, fonte: null as string | null, ordine,
});

/** Il PDF del preventivo come lo costruisce il modulo (Climatizzazione): enrich vero, documento vero. */
async function pdfDel(computo: ReturnType<typeof voce>[], progetto: Record<string, unknown>, template: Record<string, unknown> = {}) {
  const e = await enrichClimatizzazionePdf({
    progetto: { id: "p1", company_id: "c1", code: "CLM-1", detrazione_pct: 0, ...progetto } as never,
    computo: computo as never, media: [],
    template: { company_id: "c1", show_chi_siamo: false, ...template } as never, company: { name: "Bianchi" },
  });
  const dati = costruisciDatiEdile({
    modulo: MODULI_EDILI.climatizzazione, progetto: e.progetto as never, template: e.template as never, azienda: e.company,
    capitoli: e.capitoli as never, totali: e.totali, media: [],
  });
  return { testo: await testoDelPdf(<DocumentoEdilePDF dati={dati} />), totali: e.totali };
}

/** Euro stampati («1.249,89 €») → centesimi. */
const centesimi = (s: string) => Math.round(parseFloat(s.replace(/\./g, "").replace(",", ".")) * 100);
/** Le cifre del blocco dell'investimento, nell'ordine in cui il PDF le scrive. */
function bloccoInvestimento(testo: string) {
  const m = /Imponibile lavori ([\d.]+,\d\d) € (?:Sconto ([\d.,]+)% - ([\d.]+,\d\d) € Imponibile netto ([\d.]+,\d\d) € )?IVA ([\d.,]+)% ([\d.]+,\d\d) € .*?IVA [\d.,]+% inclusa ([\d.]+,\d\d) €/.exec(testo);
  if (!m) throw new Error(`Blocco dell'investimento non trovato nel PDF: ${testo.slice(testo.indexOf("Il tuo investimento"), testo.indexOf("Il tuo investimento") + 400)}`);
  return {
    lordo: centesimi(m[1]), scontoPct: m[2] ?? null, sconto: m[3] ? centesimi(m[3]) : 0, netto: m[4] ? centesimi(m[4]) : centesimi(m[1]),
    ivaPct: m[5], iva: centesimi(m[6]), totale: centesimi(m[7]),
  };
}

describe("il PDF vero: le cifre dell'investimento si sommano", () => {
  // Tre righe da 12,5 mq × 33,33 € (416,63 l'una), sconto 7,5%, IVA 22%.
  // Lordo 1.249,89; sconto 93,74 (7,5% = 93,74175); netto 1.156,15; IVA 254,35; totale 1.410,50.
  it("tre righe da 12,5 mq, sconto 7,5%, IVA 22%: 1.249,89 − 93,74 = 1.156,15 e 1.156,15 + 254,35 = 1.410,50", async () => {
    const { testo } = await pdfDel([voce("a", 12.5, 33.33, 0), voce("b", 12.5, 33.33, 1), voce("c", 12.5, 33.33, 2)], { sconto_pct: 7.5, iva_pct: 22 });
    const b = bloccoInvestimento(testo);
    expect(b).toMatchObject({ lordo: 124989, sconto: 9374, netto: 115615, iva: 25435, totale: 141050 });
    expect(b.lordo - b.sconto).toBe(b.netto);
    expect(b.netto + b.iva).toBe(b.totale);
  });

  // Un articolo da 1,99 € con sconto 10% e IVA 22%: prima il PDF diceva «Imponibile netto 1,79 · IVA 0,39 · Totale 2,19».
  it("1,99 € − 10% + IVA 22%: 1,79 + 0,40 = 2,19 (e non 1,79 + 0,39 = 2,19)", async () => {
    const { testo } = await pdfDel([voce("a", 1, 1.99, 0)], { sconto_pct: 10, iva_pct: 22 });
    const b = bloccoInvestimento(testo);
    expect(b).toMatchObject({ lordo: 199, sconto: 20, netto: 179, totale: 219 });
    expect(b.netto + b.iva).toBe(b.totale);
  });

  it("le percentuali sono all'italiana e non perdono decimali: «Sconto 7,25%», «IVA 13,5%», «TAN 9,9%»", async () => {
    const { testo } = await pdfDel([voce("a", 1, 1000, 0)], { sconto_pct: 7.25, iva_pct: 13.5 }, {
      finanziamento_promo: { attivo: true, rate: 120, tan_pct: 9.9 },
    });
    const b = bloccoInvestimento(testo);
    expect(b.scontoPct).toBe("7,25");
    expect(b.ivaPct).toBe("13,5");
    // 1.000 − 7,25% = 927,50 · IVA 13,5% = 125,2125 → totale 1.052,71 (927,50 × 1,135 = 1.052,7125), IVA 125,21.
    expect(b).toMatchObject({ lordo: 100000, sconto: 7250, netto: 92750, totale: 105271 });
    expect(testo).toContain("(TAN 9,9%)");
    expect(testo).not.toContain("(TAN 9.9%)");
    expect(testo).not.toContain("7.25%");
    expect(testo).not.toContain("13.5%");
  });

  // 1.000 € + IVA 22% = 1.220 € → 24 rate a tasso zero = 50,8333 → «da 50,83 €/mese». La rata si calcola sul totale IVA
  // inclusa (quello che paga il cliente), e il preventivo può nasconderla (mostra_finanziamento = false: «paga subito»).
  it("la rata della promo è sul totale IVA inclusa; con «mostra rata» spento sparisce, e di serie compare", async () => {
    const template = { finanziamento_promo: { attivo: true, rate: 24, tan_pct: 0 } };
    const voci = [voce("a", 1, 1000, 0)];
    const conPromo = await pdfDel(voci, { sconto_pct: 0, iva_pct: 22 }, template);
    expect(conPromo.testo).toContain("in 24 rate mensili a tasso zero");
    expect(conPromo.testo).toContain("da 50,83 €/mese");
    const dimenticata = await pdfDel(voci, { sconto_pct: 0, iva_pct: 22, mostra_finanziamento: null }, template);
    expect(dimenticata.testo).toContain("da 50,83 €/mese");
    const nascosta = await pdfDel(voci, { sconto_pct: 0, iva_pct: 22, mostra_finanziamento: false }, template);
    expect(nascosta.testo).not.toContain("/mese");
    const senzaPromo = await pdfDel(voci, { sconto_pct: 0, iva_pct: 22 });
    expect(senzaPromo.testo).not.toContain("/mese");
  });
});
