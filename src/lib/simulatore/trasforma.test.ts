import { describe, it, expect } from "vitest";
import { mapVociToQuoteItems, mapToOrderPayload, testataPreventivo } from "./trasforma";
import { calcolaSimulazione } from "./calcolaSimulazione";
import { DEFAULT_SCENARI } from "./tipi";
import type { VoceSim, SimulazioneDoc, SimulazioneRisultato } from "./tipi";

const SINGOLA_10 = { iva_mode: "singola" as const, iva_rate_singola: 10 as const };
const MISTA = { iva_mode: "mista" as const, iva_rate_singola: 10 as const };

const voce = (p: Partial<VoceSim>): VoceSim => ({
  id: "1",
  fase_id: null,
  descrizione: "x",
  fonte: "libera",
  riferimento_id: null,
  codice: null,
  quantita: 1,
  unita: "pz",
  costo_unitario: 0,
  ricarico_pct: 0,
  prezzo_unitario: 0,
  vat_rate: 10,
  bene_significativo: false,
  valore_posa_associata: null,
  is_manodopera: false,
  ordine: 0,
  ...p,
});

const COMPANY = "company-uuid";
const QUOTE = "quote-uuid";

describe("mapVociToQuoteItems", () => {
  it("mappa i campi base della riga preventivo", () => {
    const voci = [
      voce({
        id: "a",
        descrizione: "Posa cartongesso",
        quantita: 10,
        unita: "mq",
        prezzo_unitario: 18,
        costo_unitario: 12,
        vat_rate: 10,
        fonte: "listino",
        riferimento_id: "tar-1",
        is_manodopera: true,
        ordine: 0,
      }),
    ];
    const [item] = mapVociToQuoteItems(voci, COMPANY, QUOTE, SINGOLA_10);

    expect(item.quote_id).toBe(QUOTE);
    expect(item.company_id).toBe(COMPANY);
    expect(item.name).toBe("Posa cartongesso");
    expect(item.quantity).toBe(10);
    expect(item.unit_price).toBe(18);
    expect(item.vat_rate).toBe(10);
    expect(item.unit_of_measure).toBe("mq");
    expect(item.line_total).toBe(180); // 10 * 18
    expect(item.tariffa_id).toBe("tar-1"); // fonte listino
    expect(item.item_category).toBe("posa"); // is_manodopera
    expect(item.prezzo_acquisto).toBe(12); // costo_unitario (FIX 4)
    expect(item.sort_order).toBe(0);
  });

  it("prezzo_acquisto = costo_unitario su ogni riga (margine corretto nel CRM)", () => {
    const voci = [voce({ quantita: 4, prezzo_unitario: 50, costo_unitario: 30 })];
    const [item] = mapVociToQuoteItems(voci, COMPANY, QUOTE, SINGOLA_10);
    expect(item.prezzo_acquisto).toBe(30);
  });

  it("in singola ogni riga prende l'aliquota unica della simulazione, non la sua", () => {
    // La simulazione calcola il 10% su tutto: una riga al 22% faceva ricalcolare
    // al database un'IVA diversa da quella simulata.
    const voci = [voce({ quantita: 1, prezzo_unitario: 500, vat_rate: 22 })];
    const [item] = mapVociToQuoteItems(voci, COMPANY, QUOTE, SINGOLA_10);
    expect(item.vat_rate).toBe(10);
  });

  it("splitta il bene significativo nelle sue quote 10/22 in IVA mista, senza crescere", () => {
    // Riga 1.000 € di cui 300 € di posa → 600 al 10%, 400 al 22%: in tutto 1.000
    // (05/10/2026: prima 600 + 700, il preventivo cresceva della posa).
    const voci = [
      voce({
        descrizione: "Caldaia",
        quantita: 1,
        prezzo_unitario: 1000,
        costo_unitario: 700,
        bene_significativo: true,
        valore_posa_associata: 300,
        ordine: 2,
      }),
    ];
    const items = mapVociToQuoteItems(voci, COMPANY, QUOTE, MISTA);
    expect(items).toHaveLength(2);

    const riga10 = items.find((i) => i.vat_rate === 10)!;
    const riga22 = items.find((i) => i.vat_rate === 22)!;
    expect(riga10.quantity).toBe(1);
    expect(riga10.unit_price).toBe(600);
    expect(riga10.line_total).toBe(600);
    expect(riga10.name).toContain("(bene significativo)");
    expect(riga10.prezzo_acquisto).toBe(700); // il costo resta sulla riga principale
    expect(riga22.quantity).toBe(1);
    expect(riga22.unit_price).toBe(400);
    expect(riga22.name).toContain("(eccedenza 22%)");
    expect(riga22.prezzo_acquisto).toBe(0);
    expect(riga10.line_total + riga22.line_total).toBe(1000);
    // L'IVA somma combacia col simulato: 60 + 88 = 148.
    const ivaSplit = riga10.unit_price * 0.1 + riga22.unit_price * 0.22;
    expect(Math.round(ivaSplit * 100) / 100).toBe(148);
  });

  it("bene significativo dentro il limite: una sola riga al 10%, pari alla voce", () => {
    // Riga 400 € tutta di posa: niente bene oltre il limite, niente eccedenza.
    const voci = [
      voce({
        quantita: 1,
        prezzo_unitario: 400,
        bene_significativo: true,
        valore_posa_associata: 400,
      }),
    ];
    const items = mapVociToQuoteItems(voci, COMPANY, QUOTE, MISTA);
    expect(items).toHaveLength(1);
    expect(items[0].vat_rate).toBe(10);
    expect(items[0].unit_price).toBe(400);
  });

  it("bene significativo tutto oltre il limite: una sola riga al 22% col costo", () => {
    const voci = [voce({ quantita: 2, prezzo_unitario: 500, costo_unitario: 300, bene_significativo: true })];
    const items = mapVociToQuoteItems(voci, COMPANY, QUOTE, MISTA);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ vat_rate: 22, quantity: 1, unit_price: 1000, prezzo_acquisto: 600 });
  });

  it("bene significativo NON splittato in modalità singola (resta una riga)", () => {
    const voci = [
      voce({
        quantita: 2,
        prezzo_unitario: 100,
        bene_significativo: true,
        valore_posa_associata: 50,
        vat_rate: 10,
      }),
    ];
    const items = mapVociToQuoteItems(voci, COMPANY, QUOTE, SINGOLA_10);
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(2);
    expect(items[0].unit_price).toBe(100);
  });

  it("item_category=prodotto e tariffa_id=null per voce libera non-manodopera", () => {
    const voci = [
      voce({
        descrizione: "Pannello",
        quantita: 3,
        prezzo_unitario: 50.5,
        fonte: "libera",
        riferimento_id: null,
        is_manodopera: false,
        ordine: 5,
      }),
    ];
    const [item] = mapVociToQuoteItems(voci, COMPANY, QUOTE, SINGOLA_10);

    expect(item.item_category).toBe("prodotto");
    expect(item.tariffa_id).toBeNull();
    expect(item.line_total).toBe(151.5); // 3 * 50.5
    expect(item.sort_order).toBe(5);
  });

  it("tariffa_id=null quando la fonte è prezzario (non listino)", () => {
    const voci = [
      voce({ fonte: "prezzario", riferimento_id: "prz-1", is_manodopera: false }),
    ];
    const [item] = mapVociToQuoteItems(voci, COMPANY, QUOTE, SINGOLA_10);
    expect(item.tariffa_id).toBeNull();
  });

  it("prezzo con più di due decimali: 1 × il totale di riga, come lo ricalcola il database", () => {
    // unit_price è numeric(12,2): 0,335 diventerebbe 0,34 e la riga 1,02 invece di 1,01.
    const voci = [voce({ quantita: 3, unita: "ml", prezzo_unitario: 0.335, costo_unitario: 0.2 })];
    const [item] = mapVociToQuoteItems(voci, COMPANY, QUOTE, SINGOLA_10);
    expect(item.quantity).toBe(1);
    expect(item.unit_price).toBe(1.01); // 3 * 0.335 = 1.005 → 1.01
    expect(item.line_total).toBe(1.01);
    expect(item.prezzo_acquisto).toBe(0.6); // costo di riga
    expect(item.description).toContain("3 ml");
  });

  it("mappa più voci preservando l'ordine dell'array", () => {
    const voci = [
      voce({ id: "a", descrizione: "A", ordine: 0 }),
      voce({ id: "b", descrizione: "B", ordine: 1 }),
    ];
    const items = mapVociToQuoteItems(voci, COMPANY, QUOTE, SINGOLA_10);
    expect(items).toHaveLength(2);
    expect(items[0].name).toBe("A");
    expect(items[1].name).toBe("B");
  });
});

const risultato = (p: Partial<SimulazioneRisultato>): SimulazioneRisultato => ({
  costo_totale: 0,
  ricavo_imponibile: 0,
  margine_valore: 0,
  margine_pct: 0,
  costo_diretto: 0,
  spese_generali: 0,
  costo_pieno: 0,
  sconto_valore: 0,
  ricavo_lordo: 0,
  ricavo_netto: 0,
  utile_target: 0,
  margine_netto_valore: 0,
  margine_netto_pct: 0,
  riepilogo_iva: [],
  iva_totale: 0,
  prezzo_cliente: 0,
  confronto_iva: [],
  durata_settimane: 0,
  rata_mensile: null,
  ...p,
});

const doc = (p: Partial<SimulazioneDoc>): SimulazioneDoc => ({
  voci: [],
  fasi: [],
  scenari: {
    iva_mode: "singola",
    iva_rate_singola: 10,
    iva_confronto: [4, 10, 22],
    spese_generali_pct: 0,
    utile_pct: 0,
    sconto_pct: 0,
    finanziamento: null,
  },
  ...p,
});

describe("mapToOrderPayload", () => {
  it("usa il ricavo netto come total_amount (IVA esclusa)", () => {
    const payload = mapToOrderPayload(
      doc({}),
      risultato({ ricavo_imponibile: 5000, ricavo_lordo: 5000, ricavo_netto: 5000, prezzo_cliente: 5500 }),
      { companyId: COMPANY, customerId: "cust-1", userId: "user-1", statusId: "st-1", description: "Lavori" },
    );
    expect(payload.p_order_data.total_amount).toBe(5000);
    expect(payload.p_order_data.company_id).toBe(COMPANY);
    expect(payload.p_order_data.customer_id).toBe("cust-1");
    expect(payload.p_order_data.current_status_id).toBe("st-1");
    expect(payload.p_order_data.description).toBe("Lavori");
    expect(payload.p_user_id).toBe("user-1");
  });

  it("vat_rate = aliquota singola attiva", () => {
    const payload = mapToOrderPayload(
      doc({ scenari: { iva_mode: "singola", iva_rate_singola: 22, iva_confronto: [], finanziamento: null } }),
      risultato({ ricavo_imponibile: 1000 }),
      { companyId: COMPANY, customerId: "c", userId: "u", statusId: "s", description: "d" },
    );
    expect(payload.p_order_data.vat_rate).toBe(22);
  });

  it("vat_rate = aliquota EFFETTIVA in modalità mista (FIX 3a)", () => {
    // iva_totale 214 su imponibile netto 1700 → 12.59% effettivo (non 22 fisso).
    const payload = mapToOrderPayload(
      doc({ scenari: { iva_mode: "mista", iva_rate_singola: 10, iva_confronto: [], finanziamento: null } }),
      risultato({ ricavo_imponibile: 1700, ricavo_netto: 1700, iva_totale: 214 }),
      { companyId: COMPANY, customerId: "c", userId: "u", statusId: "s", description: "d" },
    );
    expect(payload.p_order_data.vat_rate).toBe(12.59); // round2(214/1700*100)
  });

  it("vat_rate mista con imponibile 0 → fallback all'aliquota singola", () => {
    const payload = mapToOrderPayload(
      doc({ scenari: { iva_mode: "mista", iva_rate_singola: 10, iva_confronto: [], finanziamento: null } }),
      risultato({ ricavo_imponibile: 0, iva_totale: 0 }),
      { companyId: COMPANY, customerId: "c", userId: "u", statusId: "s", description: "d" },
    );
    expect(payload.p_order_data.vat_rate).toBe(10);
  });

  it("comprime quantità decimale a quantity=1 con unit_price=line_total (FIX 1)", () => {
    // 12,5 mq × 8 €/mq = 100 €. order_items.quantity è INTEGER → niente cast fallito.
    const voci = [voce({ descrizione: "Massetto", quantita: 12.5, unita: "mq", prezzo_unitario: 8, costo_unitario: 5 })];
    const payload = mapToOrderPayload(
      doc({ voci }),
      risultato({ ricavo_imponibile: 100 }),
      { companyId: COMPANY, customerId: "c", userId: "u", statusId: "s", description: "d" },
    );
    expect(payload.p_items).toHaveLength(1);
    const it = payload.p_items[0];
    expect(it.quantity).toBe(1);
    expect(it.unit_price).toBe(100); // line_total 12.5 * 8
    expect(it.unit_of_measure).toBe("mq");
    expect(it.purchase_price).toBe(62.5); // 12.5 * 5 (costo di riga, non unitario)
    expect(it.description).toContain("12.5 mq"); // quantità reale nella descrizione
    expect(Number.isInteger(it.quantity)).toBe(true);
  });

  it("calcola work_start_date=oggi e work_end_date=oggi+durata*7gg", () => {
    const today = new Date("2026-06-20T10:00:00Z");
    const payload = mapToOrderPayload(
      doc({}),
      risultato({ ricavo_imponibile: 1000, durata_settimane: 3 }),
      { companyId: COMPANY, customerId: "c", userId: "u", statusId: "s", description: "d", today },
    );
    expect(payload.p_order_data.work_start_date).toBe("2026-06-20");
    // 3 settimane = 21 giorni → 2026-07-11
    expect(payload.p_order_data.work_end_date).toBe("2026-07-11");
  });

  it("work dates null se durata_settimane=0", () => {
    const payload = mapToOrderPayload(
      doc({}),
      risultato({ ricavo_imponibile: 1000, durata_settimane: 0 }),
      { companyId: COMPANY, customerId: "c", userId: "u", statusId: "s", description: "d" },
    );
    expect(payload.p_order_data.work_start_date).toBeNull();
    expect(payload.p_order_data.work_end_date).toBeNull();
  });

  it("payment_type=financing + financing_amount/cost dallo scenario finanziamento", () => {
    const payload = mapToOrderPayload(
      doc({
        scenari: {
          iva_mode: "singola",
          iva_rate_singola: 10,
          iva_confronto: [],
          finanziamento: { tabella_id: "t1", importo_finanziato: 4000, numero_rate: 24, anticipo: 1000 },
        },
      }),
      risultato({ ricavo_imponibile: 5000, prezzo_cliente: 5500, rata_mensile: 200 }),
      {
        companyId: COMPANY,
        customerId: "c",
        userId: "u",
        statusId: "s",
        description: "d",
        financingCost: 800,
      },
    );
    expect(payload.p_order_data.payment_type).toBe("financing");
    expect(payload.p_order_data.financing_amount).toBe(4000);
    expect(payload.p_order_data.financing_cost).toBe(800);
  });

  it("payment_type=standard e financing a 0 senza scenario finanziamento", () => {
    const payload = mapToOrderPayload(
      doc({}),
      risultato({ ricavo_imponibile: 1000 }),
      { companyId: COMPANY, customerId: "c", userId: "u", statusId: "s", description: "d" },
    );
    expect(payload.p_order_data.payment_type).toBe("standard");
    expect(payload.p_order_data.financing_amount).toBe(0);
    expect(payload.p_order_data.financing_cost).toBe(0);
  });

  it("include le voci mappate come p_items (quantity compressa a 1, unit_price=line_total)", () => {
    const voci = [voce({ descrizione: "Voce A", quantita: 2, prezzo_unitario: 100, vat_rate: 22 })];
    const payload = mapToOrderPayload(
      doc({ voci }),
      risultato({ ricavo_imponibile: 200, ricavo_netto: 200 }),
      { companyId: COMPANY, customerId: "c", userId: "u", statusId: "s", description: "d" },
    );
    expect(payload.p_items).toHaveLength(1);
    expect(payload.p_items[0].name).toBe("Voce A");
    expect(payload.p_items[0].quantity).toBe(1); // FIX 1: sempre 1
    expect(payload.p_items[0].unit_price).toBe(200); // line_total 2 * 100
    // In singola la riga prende l'aliquota della simulazione (e della testata), non la sua.
    expect(payload.p_items[0].vat_rate).toBe(10);
    expect(payload.p_order_data.vat_rate).toBe(10);
  });

  it("lo sconto della simulazione resta: totale netto e sconto su ogni riga", () => {
    // 10.000 € −10%: la commessa nasceva da 10.000 € (05/10/2026).
    const d = doc({
      voci: [voce({ descrizione: "Rifacimento bagno", quantita: 1, prezzo_unitario: 10000, costo_unitario: 6000 })],
      scenari: { ...DEFAULT_SCENARI, iva_mode: "singola", iva_rate_singola: 10, sconto_pct: 10 },
    });
    const r = calcolaSimulazione(d);
    const payload = mapToOrderPayload(d, r, { companyId: COMPANY, customerId: "c", userId: "u", statusId: "s", description: "d" });
    expect(r.ricavo_netto).toBe(9000);
    expect(payload.p_order_data.total_amount).toBe(9000);
    expect(payload.p_order_data.vat_rate).toBe(10);
    expect(payload.p_items[0]).toMatchObject({ unit_price: 10000, discount_percent: 10, purchase_price: 6000 });
    // Come la legge la fattura dalla commessa: prezzo × (1 − sconto).
    const nettoRighe = payload.p_items.reduce((s, it) => s + it.unit_price * it.quantity * (1 - it.discount_percent / 100), 0);
    expect(nettoRighe).toBeCloseTo(9000, 6);
  });

  it("in mista i beni significativi diventano due righe con la loro aliquota", () => {
    const d = doc({
      voci: [
        voce({ id: "c", descrizione: "Caldaia", quantita: 1, prezzo_unitario: 2000, costo_unitario: 1200, bene_significativo: true }),
        voce({ id: "m", descrizione: "Posa caldaia", quantita: 8, unita: "h", prezzo_unitario: 100, costo_unitario: 40, vat_rate: 10, is_manodopera: true }),
      ],
      scenari: { ...DEFAULT_SCENARI, iva_mode: "mista", iva_rate_singola: 10 },
    });
    const r = calcolaSimulazione(d);
    const payload = mapToOrderPayload(d, r, { companyId: COMPANY, customerId: "c", userId: "u", statusId: "s", description: "d" });
    expect(payload.p_items.map((it) => [it.name, it.vat_rate, it.unit_price, it.purchase_price])).toEqual([
      ["Caldaia (bene significativo)", 10, 800, 1200],
      ["Caldaia (eccedenza 22%)", 22, 1200, 0],
      ["Posa caldaia", 10, 800, 320],
    ]);
    expect(payload.p_items.map((it) => it.position)).toEqual([0, 1, 2]);
    expect(payload.p_order_data.total_amount).toBe(2800);
    // IVA: 1.600 × 10% + 1.200 × 22% = 424 → aliquota effettiva 15,14%.
    expect(r.iva_totale).toBe(424);
    expect(payload.p_order_data.vat_rate).toBe(15.14);
  });
});

describe("testataPreventivo", () => {
  it("porta sconto %, importo dello sconto, IVA e totale della simulazione", () => {
    const d = doc({
      voci: [voce({ quantita: 1, prezzo_unitario: 10000 })],
      scenari: { ...DEFAULT_SCENARI, iva_mode: "singola", iva_rate_singola: 10, sconto_pct: 10 },
    });
    const r = calcolaSimulazione(d);
    expect(testataPreventivo(d, r)).toEqual({
      subtotal: 10000,
      discount_percent: 10,
      discount_amount: 1000,
      vat_amount: 900,
      total: 9900,
    });
  });
});
