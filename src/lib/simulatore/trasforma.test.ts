import { describe, it, expect } from "vitest";
import { mapVociToQuoteItems, mapToOrderPayload } from "./trasforma";
import type { VoceSim, SimulazioneDoc, SimulazioneRisultato } from "./tipi";

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
    const [item] = mapVociToQuoteItems(voci, COMPANY, QUOTE);

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
    expect(item.sort_order).toBe(0);
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
    const [item] = mapVociToQuoteItems(voci, COMPANY, QUOTE);

    expect(item.item_category).toBe("prodotto");
    expect(item.tariffa_id).toBeNull();
    expect(item.line_total).toBe(151.5); // 3 * 50.5
    expect(item.sort_order).toBe(5);
  });

  it("tariffa_id=null quando la fonte è prezzario (non listino)", () => {
    const voci = [
      voce({ fonte: "prezzario", riferimento_id: "prz-1", is_manodopera: false }),
    ];
    const [item] = mapVociToQuoteItems(voci, COMPANY, QUOTE);
    expect(item.tariffa_id).toBeNull();
  });

  it("arrotonda line_total a 2 decimali", () => {
    const voci = [voce({ quantita: 3, prezzo_unitario: 0.335 })];
    const [item] = mapVociToQuoteItems(voci, COMPANY, QUOTE);
    expect(item.line_total).toBe(1.01); // 3 * 0.335 = 1.005 → 1.01
  });

  it("mappa più voci preservando l'ordine dell'array", () => {
    const voci = [
      voce({ id: "a", descrizione: "A", ordine: 0 }),
      voce({ id: "b", descrizione: "B", ordine: 1 }),
    ];
    const items = mapVociToQuoteItems(voci, COMPANY, QUOTE);
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
    finanziamento: null,
  },
  ...p,
});

describe("mapToOrderPayload", () => {
  it("usa il ricavo imponibile come total_amount (netto IVA)", () => {
    const payload = mapToOrderPayload(
      doc({}),
      risultato({ ricavo_imponibile: 5000, prezzo_cliente: 5500 }),
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

  it("vat_rate default 22 in modalità mista", () => {
    const payload = mapToOrderPayload(
      doc({ scenari: { iva_mode: "mista", iva_rate_singola: 10, iva_confronto: [], finanziamento: null } }),
      risultato({ ricavo_imponibile: 1000 }),
      { companyId: COMPANY, customerId: "c", userId: "u", statusId: "s", description: "d" },
    );
    expect(payload.p_order_data.vat_rate).toBe(22);
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

  it("include le voci mappate come p_items (name/quantity/unit_price)", () => {
    const voci = [voce({ descrizione: "Voce A", quantita: 2, prezzo_unitario: 100, vat_rate: 22 })];
    const payload = mapToOrderPayload(
      doc({ voci }),
      risultato({ ricavo_imponibile: 200 }),
      { companyId: COMPANY, customerId: "c", userId: "u", statusId: "s", description: "d" },
    );
    expect(payload.p_items).toHaveLength(1);
    expect(payload.p_items[0].name).toBe("Voce A");
    expect(payload.p_items[0].quantity).toBe(2);
    expect(payload.p_items[0].unit_price).toBe(100);
    expect(payload.p_items[0].vat_rate).toBe(22);
  });
});
