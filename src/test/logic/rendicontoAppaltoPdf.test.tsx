/**
 * Il PDF del rendiconto letto dal documento vero: renderer vero, offline, e il
 * testo estratto con pdfjs. È la carta che il committente ha in mano, quindi la
 * prova guarda proprio quella e non l'oggetto che le passiamo.
 *
 * I numeri sono quelli della simulazione su Demo Azienda 2 del 28/10/2026.
 */
import { describe, expect, it, vi } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { RendicontoAppaltoPDF } from "@/components/orders/RendicontoAppaltoPDF";
import { raggruppaPerCantiere, type RigaDaStampare } from "@/lib/appalto/fattura";

vi.setConfig({ testTimeout: 120_000 });

const riga = (
  order_id: string,
  data: string,
  descrizione: string,
  unita_misura: string,
  prezzo_unitario: number,
  quantita: number,
  importo: number,
  extra = false,
  maggiorazione_pct = 0,
): RigaDaStampare => ({
  id: `${order_id}-${data}-${descrizione}`,
  order_id,
  data,
  descrizione,
  unita_misura,
  prezzo_unitario,
  quantita,
  maggiorazione_pct,
  importo,
  extra_contratto: extra,
});

const RIGHE: RigaDaStampare[] = [
  riga("o1", "2026-09-07", "Operaio specializzato — giornata", "uomo_giorno", 290, 3, 870),
  riga("o1", "2026-09-10", "Trasporto materiale in cantiere — viaggio", "viaggio", 85, 2, 170),
  riga("o1", "2026-09-14", "Posa cappotto a parete", "mq", 24.5, 180, 4410),
  riga("o1", "2026-09-26", "Operaio specializzato — giornata", "uomo_giorno", 290, 1, 435, false, 50),
  riga("o2", "2026-09-15", "Operaio comune — giornata", "uomo_giorno", 230, 4, 920),
  riga("o2", "2026-09-16", "Trasporto materiale in cantiere — viaggio", "viaggio", 95, 3, 285),
  riga("o2", "2026-09-29", "Operaio comune — giornata", "uomo_giorno", 230, 2, 460, true),
];

const CANTIERI = [
  { id: "o1", order_code: "AP-2026-001", description: "Cappotto palazzina Via Tiraboschi 9" },
  { id: "o2", order_code: "AP-2026-002", description: "Ristrutturazione uffici Via Padova 12" },
];

/** Il testo del PDF, una pagina per elemento, spazi ridotti a uno. */
async function paginePdf(righe: RigaDaStampare[] = RIGHE): Promise<string[]> {
  const totale = righe.reduce((s, r) => s + r.importo, 0);
  const ritenuta = Math.round(totale * 4) / 100;
  const buffer = await renderToBuffer(
    RendicontoAppaltoPDF({
      numero: 1,
      periodoDal: "2026-09-01",
      periodoAl: "2026-09-30",
      statoEtichetta: "Approvato",
      azienda: {
        name: "Demo Azienda 2 S.r.l.",
        vat_number: "12345678903",
        address: "Via Esempio 1",
        city: "Milano",
        postal_code: "20100",
        province: "MI",
        logo_url: null,
      },
      committente: {
        ragione_sociale: "Edil Costruzioni Rossi S.r.l.",
        vat_number: "IT09876543210",
        address: "Via Manzoni 45",
        city: "Milano",
        postal_code: "20121",
        province: "MI",
      },
      contrattoNome: "Accordo quadro 2026",
      riferimentoCommittente: "ORD-ROSSI-2026/118",
      cantieri: raggruppaPerCantiere(righe, CANTIERI),
      totale,
      ritenutaPct: 4,
      ritenuta,
      netto: totale - ritenuta,
      note: "Rendiconto di settembre. Dettaglio per cantiere in allegato.",
    }),
  );
  const pdf = await getDocument({ data: new Uint8Array(buffer) }).promise;
  const pagine: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const text = (await page.getTextContent()).items
      .map((it) => ("str" in it ? it.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    pagine.push(text);
  }
  return pagine;
}

describe("il PDF del rendiconto d'appalto", () => {
  it("si genera, e porta in testa chi lo manda, a chi, e con che riferimento", async () => {
    const tutto = (await paginePdf()).join(" ");
    expect(tutto).toContain("Rendiconto lavori in appalto");
    expect(tutto).toContain("N° 1");
    expect(tutto).toContain("Demo Azienda 2 S.r.l.");
    expect(tutto).toContain("Edil Costruzioni Rossi S.r.l.");
    expect(tutto).toContain("Accordo quadro 2026");
    expect(tutto).toContain("ORD-ROSSI-2026/118");
    expect(tutto).toContain("01/09/2026");
    expect(tutto).toContain("30/09/2026");
  });

  it("raggruppa per cantiere: ogni cantiere ha il suo nome e il suo totale", async () => {
    const tutto = (await paginePdf()).join(" ");
    expect(tutto).toContain("AP-2026-001");
    expect(tutto).toContain("Cappotto palazzina Via Tiraboschi 9");
    expect(tutto).toContain("AP-2026-002");
    expect(tutto).toContain("Ristrutturazione uffici Via Padova 12");
    // 870 + 170 + 4.410 + 435 = 5.885 · 920 + 285 + 460 = 1.665
    expect(tutto).toContain("Totale AP-2026-001");
    expect(tutto).toContain("5.885,00");
    expect(tutto).toContain("Totale AP-2026-002");
    expect(tutto).toContain("1.665,00");
    // I cantieri sono in ordine, non nell'ordine in cui le righe sono arrivate.
    expect(tutto.indexOf("AP-2026-001")).toBeLessThan(tutto.indexOf("AP-2026-002"));
  });

  it("i totali: totale, ritenuta e netto da fatturare", async () => {
    const tutto = (await paginePdf()).join(" ");
    expect(tutto).toContain("Totale del periodo");
    expect(tutto).toContain("7.550,00");
    expect(tutto).toContain("Ritenuta a garanzia 4%");
    expect(tutto).toContain("302,00");
    expect(tutto).toContain("Netto da fatturare");
    expect(tutto).toContain("7.248,00");
  });

  it("ogni riga porta data, quantità e prezzo del listino", async () => {
    const tutto = (await paginePdf()).join(" ");
    expect(tutto).toContain("07/09/2026");
    expect(tutto).toContain("Posa cappotto a parete");
    expect(tutto).toContain("24,50");
    // Le quantità non sono soldi: 180 m², non 180,00.
    expect(tutto).toMatch(/\b180\b/);
    // La maggiorazione si vede: altrimenti un prezzo diverso dal listino
    // sembrerebbe un errore.
    expect(tutto).toContain("+50%");
    // Il prezzo di questo cantiere (trasporto a 95 invece di 85) è quello
    // congelato nella riga, non quello generale del listino.
    expect(tutto).toContain("95,00");
  });

  it("una riga fuori contratto lo dice: è quella che si discute", async () => {
    const tutto = (await paginePdf()).join(" ");
    expect(tutto).toContain("Fuori contratto");
  });

  it("niente costi e niente margini: non sono affari del committente", async () => {
    const tutto = (await paginePdf()).join(" ").toLowerCase();
    expect(tutto).not.toContain("margine");
    expect(tutto).not.toContain("costo");
  });

  it("senza ritenuta non stampa una riga di ritenuta a zero", async () => {
    const buffer = await renderToBuffer(
      RendicontoAppaltoPDF({
        numero: 2,
        periodoDal: "2026-10-01",
        periodoAl: "2026-10-31",
        statoEtichetta: "Bozza",
        azienda: { name: "Demo Azienda 2 S.r.l." },
        committente: { ragione_sociale: "Edil Costruzioni Rossi S.r.l." },
        cantieri: raggruppaPerCantiere([RIGHE[0]], CANTIERI),
        totale: 870,
        ritenutaPct: 0,
        ritenuta: 0,
        netto: 870,
      }),
    );
    const pdf = await getDocument({ data: new Uint8Array(buffer) }).promise;
    const text = (await (await pdf.getPage(1)).getTextContent()).items
      .map((it) => ("str" in it ? it.str : ""))
      .join(" ");
    expect(text).not.toContain("Ritenuta a garanzia");
    expect(text).toContain("Netto da fatturare");
  });
});
