/**
 * I numeri del PDF del preventivo Serramenti (06/10/2026): quello che legge il cliente, letto dal documento vero
 * (renderer vero, offline) e confrontato con attesi calcolati a mano. Totale, sconto, imponibile e IVA (anche
 * mista e col prezzo scritto a mano), rate, detrazione col massimale e finanziamento.
 */
import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createFullSerramentiTemplate } from "@/lib/moduli-vendita/fullSerramentiModules";
import { buildMockPdfData } from "@/lib/serramenti/mockPdfData";
import { SerramentoPDF } from "@/components/serramenti/SerramentoPDF";
import type { SrAccessorioRow, SrProgettoRow, SrSerramentoRow, SrServizioRow } from "@/types/serramenti";

vi.setConfig({ testTimeout: 180_000 });

vi.mock("@/lib/storage/immaginiModelloPdf", () => ({ CAMPI_IMMAGINE_SERRAMENTI: [], firmaImmagine: async (v: unknown): Promise<unknown> => v, firmaImmaginiModello: async (v: unknown): Promise<unknown> => v }));
vi.mock("@/lib/pdf/votiOnline", () => ({ votiOnlineAzienda: async (): Promise<null> => null }));
vi.mock("@/lib/serramenti/pdfImageUtils", () => ({ toDataUrl: async (url: string | null): Promise<string | null> => {
  if (!url || url.startsWith("data:")) return url;
  if (url.startsWith(window.location.origin + "/")) url = new URL(url).pathname;
  if (!url.startsWith("/")) throw new Error(`Remote image forbidden: ${url}`);
  const bytes = await readFile(path.resolve("public", url.slice(1)));
  return `data:image/${url.endsWith(".png") ? "png" : "jpeg"};base64,${bytes.toString("base64")}`;
} }));

interface Preventivo {
  /** Il PDF del modello generale dell'azienda e non quello di un modello pronto (cambiano alcune diciture). */
  generale?: boolean;
  progetto?: Partial<SrProgettoRow>;
  serramenti?: Array<Partial<SrSerramentoRow>>;
  accessori?: Array<Partial<SrAccessorioRow>>;
  servizi?: Array<Partial<SrServizioRow>>;
}

/** Il testo del PDF, una pagina per elemento, spazi ridotti a uno. */
async function paginePdf({ generale = false, progetto = {}, serramenti, accessori = [], servizi = [] }: Preventivo): Promise<string[]> {
  const template = createFullSerramentiTemplate({ company_id: "qa", ragione_sociale: "Impresa esempio" }, "finestre");
  const dati = await buildMockPdfData({ template, moduleId: "finestre", companyName: "Impresa esempio" });
  if (generale && dati.template) dati.template = { ...dati.template, id: "tpl-azienda" };
  const d = dati.detail;
  d.progetto = {
    ...d.progetto,
    iva_percentuale: 10, sconto_percentuale: 0, sconto_importo: 0, prezzo_manuale: null,
    pagamento_milestones: null, schema_pagamento: "tre_step", fin_piani: [],
    detrazione_aliquota: null, detrazione_eur_totale: null, detrazione_eur_anno: null,
    risparmio_calcolato: false, risparmio_eur_anno: null,
    ...progetto,
  } as SrProgettoRow;
  d.serramenti = (serramenti ?? [{ prezzo_totale: 12000 }]).map((s, i) => ({ ...d.serramenti[0], id: `srm-${i}`, quantita: 1, prezzo_unitario: s.prezzo_totale, ...s })) as SrSerramentoRow[];
  d.accessori = accessori.map((a, i) => ({ id: `acc-${i}`, tipo: "zanzariera", quantita: 1, ...a })) as SrAccessorioRow[];
  d.servizi = servizi.map((m, i) => ({ id: `srv-${i}`, quantita: 1, descrizione: "Servizio", ...m })) as SrServizioRow[];
  const bytes = await renderToBuffer(SerramentoPDF(dati) as Parameters<typeof renderToBuffer>[0]);
  const pdf = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
  const pagine: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const pagina = await pdf.getPage(i);
    pagine.push((await pagina.getTextContent()).items.map((x) => ("str" in x ? x.str : "")).join(" ").replace(/\s+/g, " "));
  }
  return pagine;
}

const pagina = (pagine: string[], contiene: string) => {
  const trovata = pagine.find((p) => p.includes(contiene));
  expect(trovata, `nessuna pagina contiene «${contiene}»`).toBeTruthy();
  return trovata as string;
};

describe("PDF Serramenti — totale, sconto, imponibile e IVA", () => {
  it("prezzo scritto a mano 8.000, sconto 5%, IVA 22%: 7.600 di imponibile, IVA 1.672, totale 9.272", async () => {
    const pagine = await paginePdf({
      progetto: { iva_percentuale: 22, sconto_percentuale: 5, prezzo_manuale: 8000 },
      serramenti: [{ prezzo_totale: 0 }],
    });
    const p = pagina(pagine, "TOTALE PREVENTIVO");
    expect(p).toContain("TOTALE PREVENTIVO € 9.272,00 IVA inclusa");
    expect(p).toContain("Prezzo € 8.000,00 · Sconto 5% - € 400,00");
    expect(p).toContain("Imponibile € 7.600,00 · IVA € 1.672,00");
    expect(p).toContain("IVA applicata: 22% ordinaria");
  });

  it("IVA mista: 5.000 di serramenti, 1.200 di complementi, 800 di servizi → 7.000 + 1.060 = 8.060", async () => {
    const pagine = await paginePdf({
      progetto: { iva_percentuale: -1 },
      serramenti: [{ prezzo_totale: 5000 }],
      accessori: [{ prezzo_totale: 1200, prezzo_unitario: 1200 }],
      servizi: [{ prezzo_totale_vendita: 800, prezzo_unitario_vendita: 800 }],
    });
    const p = pagina(pagine, "TOTALE PREVENTIVO");
    expect(p).toContain("TOTALE PREVENTIVO € 8.060,00 IVA inclusa");
    expect(p).toContain("Imponibile € 7.000,00 · IVA € 1.060,00");
    expect(p).toContain("Beni Significativi");
  });

  it("IVA mista con sconto del 10%: ogni categoria scala, totale 7.254 (6.300 + 954)", async () => {
    const pagine = await paginePdf({
      progetto: { iva_percentuale: -1, sconto_percentuale: 10 },
      serramenti: [{ prezzo_totale: 5000 }],
      accessori: [{ prezzo_totale: 1200, prezzo_unitario: 1200 }],
      servizi: [{ prezzo_totale_vendita: 800, prezzo_unitario_vendita: 800 }],
    });
    const p = pagina(pagine, "TOTALE PREVENTIVO");
    expect(p).toContain("TOTALE PREVENTIVO € 7.254,00 IVA inclusa");
    expect(p).toContain("Imponibile € 6.300,00 · IVA € 954,00");
  });

  it("IVA 0%: «IVA non applicata», nessuna IVA nel conto", async () => {
    const p = pagina(await paginePdf({ progetto: { iva_percentuale: 0 }, serramenti: [{ prezzo_totale: 3000 }] }), "TOTALE PREVENTIVO");
    expect(p).toContain("TOTALE PREVENTIVO € 3.000,00 IVA non applicata");
    expect(p).toContain("Imponibile € 3.000,00 · IVA € 0,00");
  });

  it("uno sconto sotto mezzo euro non è uno sconto da mostrare, ma il totale ne tiene conto", async () => {
    const p = pagina(await paginePdf({ progetto: { iva_percentuale: 10, sconto_importo: 0.4 }, serramenti: [{ prezzo_totale: 1000 }] }), "TOTALE PREVENTIVO");
    expect(p).not.toContain("Sconto");
    expect(p).toContain("TOTALE PREVENTIVO € 1.099,56 IVA inclusa"); // (1.000 − 0,40) × 1,10 = 1.099,56
  });

  it("il totale del PDF è quello salvato sul preventivo, per molte combinazioni di sconto e IVA", async () => {
    const { totaliDelPreventivo } = await import("@/lib/serramenti/righePreventivo");
    const casi: Array<Partial<SrProgettoRow>> = [
      { iva_percentuale: 10, sconto_percentuale: 7.5 },
      { iva_percentuale: 22, sconto_importo: 333.33, sconto_percentuale: 12.5 },
      { iva_percentuale: 4, sconto_percentuale: 3 },
    ];
    for (const progetto of casi) {
      const voci = { serramenti: [{ prezzo_totale: 1234.56 }, { prezzo_totale: 987.65 }], accessori: [{ prezzo_totale: 321.09, prezzo_unitario: 321.09 }] };
      const salvato = totaliDelPreventivo({
        serramenti: voci.serramenti as SrSerramentoRow[], accessori: voci.accessori as SrAccessorioRow[],
      }, progetto).totale_max;
      const p = pagina(await paginePdf({ progetto, ...voci }), "TOTALE PREVENTIVO");
      const stampato = /TOTALE PREVENTIVO € ([\d.]+,\d{2})/.exec(p)?.[1] ?? "";
      expect(Number(stampato.replace(/\./g, "").replace(",", ".")), JSON.stringify(progetto)).toBe(salvato);
    }
  });
});

describe("PDF Serramenti — la scritta dei pezzi in «Proposta di intervento»", () => {
  it("un solo serramento è «1 serramento», non «1 serramenti»; più pezzi «3 serramenti»", async () => {
    const uno = pagina(await paginePdf({ generale: true, serramenti: [{ prezzo_totale: 1200, quantita: 1 }] }), "ANAGRAFICA CLIENTE");
    expect(uno).toContain("1 serramento · sostituzione");
    expect(uno).not.toContain("1 serramenti");
    const tre = pagina(await paginePdf({ generale: true, serramenti: [{ prezzo_totale: 3600, quantita: 3 }] }), "ANAGRAFICA CLIENTE");
    expect(tre).toContain("3 serramenti · sostituzione");
  });

  it("i modelli pronti dicono «prodotto» e «prodotti»", async () => {
    const uno = pagina(await paginePdf({ serramenti: [{ prezzo_totale: 1200, quantita: 1 }] }), "ANAGRAFICA CLIENTE");
    expect(uno).toContain("1 prodotto · sostituzione");
  });
});

describe("PDF Serramenti — rate, finanziamento e detrazione", () => {
  const rate3 = [
    { label: "Acconto alla firma", percentuale: 30, when: "Firma contratto" },
    { label: "Acconto arrivo merce", percentuale: 40, when: "Merce in magazzino" },
    { label: "Saldo", percentuale: 30, when: "Prima dei lavori" },
  ];

  it("le rate sono percentuale × totale IVA inclusa: 30/40/30 su 13.200 → 3.960, 5.280, 3.960", async () => {
    const pagine = await paginePdf({
      progetto: { iva_percentuale: 10, pagamento_milestones: rate3, schema_pagamento: "tre_step" },
      serramenti: [{ prezzo_totale: 12000 }],
    });
    const p = pagina(pagine, "MODALITÀ DI PAGAMENTO");
    expect(p).toContain("30% € 3.960");
    expect(p).toContain("40% € 5.280");
    expect(p).toContain("30% € 3.960");
  });

  it("senza rate scritte sul preventivo il PDF non ha il blocco «Modalità di pagamento»", async () => {
    const pagine = await paginePdf({ progetto: { iva_percentuale: 10, pagamento_milestones: null }, serramenti: [{ prezzo_totale: 12000 }] });
    expect(pagine.some((x) => x.includes("MODALITÀ DI PAGAMENTO"))).toBe(false);
  });

  it("la detrazione si calcola sul totale di adesso: dopo una modifica delle posizioni non resta su quello di prima", async () => {
    // Detrazione salvata quando il totale era 11.000 (50% = 5.500); oggi le posizioni valgono 12.000 + 10% = 13.200,
    // e il 50% è 6.600, 660 all'anno.
    const pagine = await paginePdf({
      progetto: { iva_percentuale: 10, detrazione_aliquota: 50, detrazione_eur_totale: 5500, detrazione_eur_anno: 550 },
      serramenti: [{ prezzo_totale: 12000 }],
    });
    const p = pagina(pagine, "DETRAZIONE FISCALE");
    expect(p).toContain("DETRAZIONE 50% RECUPERABILE IN 10 QUOTE ANNUALI € 6.600");
    expect(p).toContain("circa € 660 / anno per 10 anni");
    expect(p).not.toContain("€ 5.500");
  });

  it("la detrazione rispetta il massimale di 96.000 €: su 120.000 € il 50% è 48.000, 4.800 all'anno", async () => {
    const pagine = await paginePdf({
      progetto: { iva_percentuale: 0, detrazione_aliquota: 50, detrazione_eur_totale: 60000, detrazione_eur_anno: 6000 },
      serramenti: [{ prezzo_totale: 120000 }],
    });
    const p = pagina(pagine, "DETRAZIONE FISCALE");
    expect(p).toContain("€ 48.000");
    expect(p).toContain("circa € 4.800 / anno");
  });

  it("detrazione al 36%: 36% del totale, e senza aliquota non c'è detrazione", async () => {
    const con = pagina(await paginePdf({
      progetto: { iva_percentuale: 10, detrazione_aliquota: 36, detrazione_eur_totale: 100, detrazione_eur_anno: 10 },
      serramenti: [{ prezzo_totale: 10000 }],
    }), "DETRAZIONE FISCALE");
    expect(con).toContain("DETRAZIONE 36% RECUPERABILE IN 10 QUOTE ANNUALI € 3.960"); // 11.000 × 36%
    const senza = await paginePdf({ progetto: { iva_percentuale: 10, detrazione_aliquota: 0, detrazione_eur_totale: 5500, detrazione_eur_anno: 550 }, serramenti: [{ prezzo_totale: 10000 }] });
    expect(senza.some((x) => x.includes("DETRAZIONE FISCALE"))).toBe(false);
  });

  it("il finanziamento: il TAN si scrive all'italiana, con la virgola", async () => {
    const pagine = await paginePdf({
      progetto: {
        iva_percentuale: 10, schema_pagamento: "acconto_finanziato",
        pagamento_milestones: [{ label: "Acconto alla firma", percentuale: 30, when: "Firma" }, { label: "Finanziamento", percentuale: 70, when: "Inizio lavori" }],
        fin_piani: [{ nome: "Standard", mesi: 60, tasso: 4.75, rata_mese: 95, anticipo: 3960, finanziato: 9240 }],
      },
      serramenti: [{ prezzo_totale: 12000 }],
    });
    const p = pagina(pagine, "SIMULAZIONE FINANZIAMENTO");
    expect(p).toContain("STANDARD · 60 MESI · TAN 4,75%");
    expect(p).toContain("finanziato € 9.240");
  });
});
