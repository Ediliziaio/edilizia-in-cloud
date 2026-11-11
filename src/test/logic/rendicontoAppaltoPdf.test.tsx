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
import { NOTA_TOTALE_RENDICONTO, RendicontoAppaltoPDF, notaPerCommittente } from "@/components/orders/RendicontoAppaltoPDF";
import { raggruppaPerCantiere, type RigaDaStampare } from "@/lib/appalto/fattura";
import { giornaleDaAllegare, type CantiereAllegato, type RigaGiornaleDb } from "@/lib/appalto/giornaleAllegato";

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
async function paginePdf(righe: RigaDaStampare[] = RIGHE, giornale: CantiereAllegato[] = []): Promise<string[]> {
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
      giornale,
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
    // Sotto il netto, in piccolo, cosa comprende il totale (11/11/2026).
    expect(NOTA_TOTALE_RENDICONTO).toBe("Comprende manodopera, straordinari e voci extra dei rapportini; materiali e mezzi non sono compresi.");
    expect(tutto).toContain(NOTA_TOTALE_RENDICONTO);
    expect(tutto.indexOf(NOTA_TOTALE_RENDICONTO)).toBeGreaterThan(tutto.indexOf("Netto da fatturare"));
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

describe("il giornale allegato al rendiconto", () => {
  const firmata = (order_id: string, data_lavori: string, lavorazioni_eseguite: string): RigaGiornaleDb => ({
    order_id, data_lavori, condizioni_meteo: "soleggiato", lavorazioni_eseguite, materiali_utilizzati: "Colla 10 sacchi", personale_presente: 3, firmato_da: "Mario Direttore", pm_signed_at: "2026-09-08T10:00:00Z",
  });
  const nomi = new Map([["o1", "AP-2026-001 · Cappotto"], ["o2", "AP-2026-002 · Tetto"]]);

  it("riporta le pagine firmate e dice quali giorni non ne hanno una, senza importi", async () => {
    const allegato = giornaleDaAllegare(RIGHE, [firmata("o1", "2026-09-07", "Posa pannelli lato nord")], nomi);
    const pagine = await paginePdf(RIGHE, allegato);
    const ultima = pagine.at(-1) ?? "";
    expect(ultima).toContain("Allegato: giornale dei lavori");
    expect(ultima).toContain("Posa pannelli lato nord");
    expect(ultima).toContain("Firmata da Mario Direttore");
    expect(ultima).toContain("Giorni senza pagina firmata");
    expect(ultima).not.toContain("€");
  });

  it("nessuna pagina firmata: nessun allegato", () => {
    expect(giornaleDaAllegare(RIGHE, [], nomi)).toEqual([]);
  });

  it("una pagina di un giorno non rendicontato resta fuori", () => {
    const allegato = giornaleDaAllegare(RIGHE, [firmata("o1", "2026-09-07", "Giusta"), firmata("o1", "2026-09-08", "Fuori")], nomi);
    expect(allegato.flatMap((c) => c.giornate.map((g) => g.lavorazioni))).toEqual(["Giusta"]);
  });
});

describe("il rendiconto dalla simulazione su Impresa Vulcano (10/11/2026)", () => {
  const VULCANO = "7c87c209-7868-42d0-ad98-6c95ac6de196";
  // PNG 1×1: basta per vedere se il logo entra nel documento.
  const LOGO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  const conNota = (descrizione: string, note: string | null): RigaDaStampare => ({ ...riga("o1", "2026-11-03", descrizione, "ora", 32, 8, 256), note });

  async function stampa(righe: RigaDaStampare[], opz: { companyId?: string; logo?: string | null } = {}) {
    const totale = righe.reduce((s, r) => s + r.importo, 0);
    const buffer = await renderToBuffer(
      RendicontoAppaltoPDF({
        numero: 3, periodoDal: "2026-11-01", periodoAl: "2026-11-30", statoEtichetta: "Bozza",
        azienda: { name: "Impresa Vulcano s.r.l.", logo_url: opz.logo ?? null },
        committente: { ragione_sociale: "Condominio Aurora" },
        cantieri: raggruppaPerCantiere(righe, CANTIERI),
        totale, ritenutaPct: 0, ritenuta: 0, netto: totale, companyId: opz.companyId ?? null,
      }),
    );
    const pdf = await getDocument({ data: new Uint8Array(buffer) }).promise;
    const text = (await (await pdf.getPage(1)).getTextContent()).items.map((it) => ("str" in it ? it.str : "")).join(" ").replace(/\s+/g, " ");
    return { text, raw: Buffer.from(buffer).toString("latin1") };
  }

  it("il nome della persona esce una volta sola", async () => {
    const { text } = await stampa([conNota("Capocantiere — ora", "Marco Colombo")]);
    expect(text.match(/Marco Colombo/g)).toHaveLength(1);
    expect(text).not.toContain("ora · Marco Colombo");
    expect(text).toContain("Capocantiere — ora");
  });

  it("l'etichetta interna «Voce del rapportino» non arriva al committente", async () => {
    const { text } = await stampa([conNota("Nolo ponteggio", "Voce del rapportino")]);
    expect(text).toContain("Nolo ponteggio");
    expect(text).not.toContain("Voce del rapportino");
    expect(notaPerCommittente("Voce del rapportino")).toBeNull();
    expect(notaPerCommittente("  voce libera del rapportino ")).toBeNull();
    expect(notaPerCommittente("Marco Colombo")).toBe("Marco Colombo");
    expect(notaPerCommittente(null)).toBeNull();
  });

  it("in testata il nome dell'impresa, e il logo quando c'è", async () => {
    const senza = await stampa([RIGHE[0]]);
    expect(senza.text.indexOf("Impresa Vulcano s.r.l.")).toBeLessThan(senza.text.indexOf("Rendiconto lavori in appalto"));
    expect(senza.raw).not.toContain("/Subtype /Image");
    const altra = await stampa([RIGHE[0]], { logo: LOGO });
    expect(altra.raw).toContain("/Subtype /Image");
    const vulcano = await stampa([RIGHE[0]], { logo: LOGO, companyId: VULCANO });
    expect(vulcano.raw).toContain("/Subtype /Image");
    // Lo stile unico (10/11/2026): col logo il nome scritto non si ripete in testata, per nessuna azienda (sta nel
    // logo e nel piè). Il testo prima del titolo, dopo il numero di pagina del piè, è la testata.
    const testata = (t: string) => t.slice(t.indexOf("Pag. 1 / 1"), t.indexOf("Rendiconto lavori in appalto"));
    expect(testata(altra.text)).not.toContain("Impresa Vulcano s.r.l.");
    expect(testata(vulcano.text)).not.toContain("Impresa Vulcano s.r.l.");
  });
});
