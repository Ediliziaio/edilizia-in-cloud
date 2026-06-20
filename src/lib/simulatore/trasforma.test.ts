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
    expect(item.prezzo_acquisto).toBe(12); // costo_unitario (FIX 4)
    expect(item.sort_order).toBe(0);
  });

  it("prezzo_acquisto = costo_unitario su ogni riga (margine corretto nel CRM)", () => {
    const voci = [voce({ quantita: 4, prezzo_unitario: 50, costo_unitario: 30 })];
    const [item] = mapVociToQuoteItems(voci, COMPANY, QUOTE);
    expect(item.prezzo_acquisto).toBe(30);
  });

  it("splitta il bene significativo in due righe 10/22 in IVA mista (FIX 3b)", () => {
    // B = 1*1000 = 1000, posa = 300 → riga10 imponibile 600, riga22 imponibile 700.
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
    const items = mapVociToQuoteItems(voci, COMPANY, QUOTE, "mista");
    expect(items).toHaveLength(2);

    const riga10 = items.find((i) => i.vat_rate === 10)!;
    const riga22 = items.find((i) => i.vat_rate === 22)!;
    expect(riga10.quantity).toBe(1);
    expect(riga10.unit_price).toBe(600);
    expect(riga10.line_total).toBe(600);
    expect(riga10.name).toContain("(bene significativo)");
    expect(riga10.prezzo_acquisto).toBe(700); // il costo resta sulla riga principale
    expect(riga22.quantity).toBe(1);
    expect(riga22.unit_price).toBe(700);
    expect(riga22.name).toContain("(eccedenza 22%)");
    expect(riga22.prezzo_acquisto).toBe(0);
    // L'IVA somma combacia col simulato: 60 + 154 = 214.
    const ivaSplit = riga10.unit_price * 0.1 + riga22.unit_price * 0.22;
    expect(Math.round(ivaSplit * 100) / 100).toBe(214);
  });

  it("bene significativo: una sola riga 10 quando l'eccedenza è 0 (posa = metà di B)", () => {
    // B = 600, posa = 300 → eccedenza 22 = max(0, 600-300) = 300 (>0, due righe).
    // Per avere una sola riga serve posa ≥ B/... in realtà eccedenza 0 ⇔ posa ≥ B.
    // B = 400, posa = 400 → riga10 = 400 + min(400,400) = 800; eccedenza 0.
    const voci = [
      voce({
        quantita: 1,
        prezzo_unitario: 400,
        bene_significativo: true,
        valore_posa_associata: 400,
      }),
    ];
    const items = mapVociToQuoteItems(voci, COMPANY, QUOTE, "mista");
    expect(items).toHaveLength(1);
    expect(items[0].vat_rate).toBe(10);
    // posa + min(B, posa) = 400 + 400 = 800 (coerente con calcolaIva).
    expect(items[0].unit_price).toBe(800);
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
    const items = mapVociToQuoteItems(voci, COMPANY, QUOTE, "singola");
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

  it("vat_rate = aliquota EFFETTIVA in modalità mista (FIX 3a)", () => {
    // iva_totale 214 su imponibile 1700 → 12.59% effettivo (non 22 fisso).
    const payload = mapToOrderPayload(
      doc({ scenari: { iva_mode: "mista", iva_rate_singola: 10, iva_confronto: [], finanziamento: null } }),
      risultato({ ricavo_imponibile: 1700, iva_totale: 214 }),
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
      risultato({ ricavo_imponibile: 200 }),
      { companyId: COMPANY, customerId: "c", userId: "u", statusId: "s", description: "d" },
    );
    expect(payload.p_items).toHaveLength(1);
    expect(payload.p_items[0].name).toBe("Voce A");
    expect(payload.p_items[0].quantity).toBe(1); // FIX 1: sempre 1
    expect(payload.p_items[0].unit_price).toBe(200); // line_total 2 * 100
    expect(payload.p_items[0].vat_rate).toBe(22);
  });
});
