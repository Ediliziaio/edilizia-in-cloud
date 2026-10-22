import { describe, expect, it } from "vitest";
import {
  calcolaAnalisiAcquisti,
  calcolaFirmaPrimoOrdine,
  computePriceBenchmarks,
  eDescrizioneGenerica,
  eUnitaForfait,
  formatShare,
  formatVariazione,
  imponibileFattura,
  mesiDelPeriodo,
  normalizzaPiva,
  periodoAnnoPrima,
  periodoDaScelta,
  prezzoNetto,
  totalPotentialSaving,
  variazione,
  type DatiGrezziAcquisti,
  type FatturaRiga,
  type OrdineAcquistoRiga,
  type PurchaseLine,
  type ScadenzaRiga,
} from "@/lib/procurement/spendAnalysis";

const OGGI = new Date(2026, 9, 21); // 21 ottobre 2026

function line(partial: Partial<PurchaseLine>): PurchaseLine {
  return {
    description: null,
    sku: null,
    article_template_id: null,
    unit_of_measure: "kg",
    quantity: 1,
    unit_price: 0,
    discount_percent: 0,
    line_total: null,
    supplier_id: null,
    supplier_name: null,
    issue_date: "2026-09-01",
    ...partial,
  };
}

describe("prezzo netto", () => {
  it("usa il totale riga diviso la quantità quando c'è", () => {
    expect(prezzoNetto({ quantity: 10, unit_price: 12, discount_percent: 0, line_total: 100 })).toBe(10);
  });
  it("senza totale riga applica lo sconto al prezzo", () => {
    expect(prezzoNetto({ quantity: 10, unit_price: 20, discount_percent: 25, line_total: null })).toBe(15);
  });
});

describe("confronto prezzi dello stesso articolo", () => {
  it("risparmio = (prezzo pagato − minimo) × quantità, su prezzi netti", () => {
    const lines = [
      line({ description: "Cemento 32.5 sacco 25kg", quantity: 100, unit_price: 10, supplier_id: "s1", supplier_name: "Caro", issue_date: "2026-03-10" }),
      // listino 10 con 20% di sconto = 8 netti
      line({ description: "Cemento 32.5 sacco 25kg", quantity: 100, unit_price: 10, discount_percent: 20, supplier_id: "s2", supplier_name: "Economico", issue_date: "2026-05-10" }),
    ];
    const [b] = computePriceBenchmarks(lines, { oggi: OGGI });
    expect(b.minPrice).toBe(8);
    expect(b.maxPrice).toBe(10);
    expect(b.potentialSaving).toBe(200);
    expect(b.bestSupplierName).toBe("Economico");
    expect(b.lastSupplierName).toBe("Economico");
    expect(b.avgPrice).toBeCloseTo(9, 5);
  });

  it("esclude le voci a corpo / forfait", () => {
    expect(eUnitaForfait("a corpo")).toBe(true);
    expect(eUnitaForfait("Corpo")).toBe(true);
    expect(eUnitaForfait("forfait")).toBe(true);
    expect(eUnitaForfait("A.C.")).toBe(true);
    expect(eUnitaForfait("mq")).toBe(false);
    const lines = [
      line({ description: "Posa pavimento", unit_of_measure: "a corpo", quantity: 1, unit_price: 5000, supplier_id: "a" }),
      line({ description: "Posa pavimento", unit_of_measure: "a corpo", quantity: 1, unit_price: 1500, supplier_id: "b" }),
    ];
    expect(computePriceBenchmarks(lines, { oggi: OGGI })).toHaveLength(0);
  });

  it("esclude le righe da 1 con il nome di una categoria (il caso Demo 2)", () => {
    expect(eDescrizioneGenerica("Cementi, malte e rasanti")).toBe(true);
    expect(eDescrizioneGenerica("Materiale elettrico vario")).toBe(true);
    expect(eDescrizioneGenerica("Cemento 32.5 sacco 25kg")).toBe(false);
    const lines = [
      line({ description: "Cementi, malte e rasanti", unit_of_measure: "pz", quantity: 1, unit_price: 40000, supplier_id: "a" }),
      line({ description: "Cementi, malte e rasanti", unit_of_measure: "pz", quantity: 1, unit_price: 3000, supplier_id: "b" }),
      line({ description: "Cementi, malte e rasanti", unit_of_measure: "pz", quantity: 1, unit_price: 900, supplier_id: "c" }),
    ];
    expect(computePriceBenchmarks(lines, { oggi: OGGI })).toHaveLength(0);
  });

  it("separa unità di misura diverse e unisce i sinonimi", () => {
    const lines = [
      line({ description: "Rete elettrosaldata", unit_of_measure: "kg", quantity: 100, unit_price: 1, supplier_id: "a" }),
      line({ description: "Rete elettrosaldata", unit_of_measure: "mq", quantity: 10, unit_price: 5, supplier_id: "b" }),
    ];
    expect(computePriceBenchmarks(lines, { oggi: OGGI })).toHaveLength(0);
    const sinonimi = [
      line({ description: "Tassello 8x60", unit_of_measure: "pz", quantity: 100, unit_price: 0.2, supplier_id: "a" }),
      line({ description: "Tassello 8x60", unit_of_measure: "Nr.", quantity: 100, unit_price: 0.1, supplier_id: "b" }),
    ];
    expect(computePriceBenchmarks(sinonimi, { oggi: OGGI })).toHaveLength(1);
  });

  it("considera solo gli ultimi 12 mesi", () => {
    const lines = [
      line({ sku: "ABC", quantity: 10, unit_price: 5, supplier_id: "a", issue_date: "2025-01-10" }),
      line({ sku: "ABC", quantity: 10, unit_price: 9, supplier_id: "b", issue_date: "2026-06-10" }),
    ];
    expect(computePriceBenchmarks(lines, { oggi: OGGI })).toHaveLength(0);
  });

  it("serve almeno 2 fornitori o 3 acquisti", () => {
    const due = [
      line({ sku: "X", quantity: 5, unit_price: 10, supplier_id: "a" }),
      line({ sku: "X", quantity: 5, unit_price: 12, supplier_id: "a" }),
    ];
    expect(computePriceBenchmarks(due, { oggi: OGGI })).toHaveLength(0);
    const tre = [...due, line({ sku: "X", quantity: 5, unit_price: 11, supplier_id: "a" })];
    const res = computePriceBenchmarks(tre, { oggi: OGGI });
    expect(res).toHaveLength(1);
    // (12-10)*5 + (11-10)*5 = 15
    expect(res[0].potentialSaving).toBe(15);
  });

  it("raggruppa per articolo del listino anche con descrizioni diverse", () => {
    const lines = [
      line({ article_template_id: "tpl-1", description: "Tubo PVC ø100", quantity: 10, unit_price: 5, supplier_id: "a" }),
      line({ article_template_id: "tpl-1", description: "TUBO pvc 100mm", quantity: 10, unit_price: 4, supplier_id: "b" }),
    ];
    const res = computePriceBenchmarks(lines, { oggi: OGGI });
    expect(res).toHaveLength(1);
    expect(totalPotentialSaving(res)).toBe(10);
  });
});

describe("fatture ricevute", () => {
  const base = { cedente_ragione_sociale: "Alfa", cedente_piva: "IT01234567890", data_fattura: "2026-05-01", totale_documento: 1220, iva_totale: 220 };
  it("le note di credito dell'elenco condiviso sottraggono, anche se registrate positive", () => {
    expect(imponibileFattura({ ...base, imponibile_totale: 1000, tipo_documento: "TD01" })).toBe(1000);
    expect(imponibileFattura({ ...base, imponibile_totale: 1000, tipo_documento: "TD04" })).toBe(-1000);
    expect(imponibileFattura({ ...base, imponibile_totale: -300, tipo_documento: "TD08" })).toBe(-300);
    expect(imponibileFattura({ ...base, imponibile_totale: 200, tipo_documento: "passive_credit_note" })).toBe(-200);
  });
  it("senza imponibile usa totale − IVA", () => {
    expect(imponibileFattura({ ...base, imponibile_totale: null, tipo_documento: "TD01" })).toBe(1000);
  });
  it("P.IVA con o senza IT è la stessa", () => {
    expect(normalizzaPiva("IT 01234567890")).toBe("01234567890");
    expect(normalizzaPiva("01234567890")).toBe("01234567890");
  });
});

describe("periodo", () => {
  it("anno in corso, ultimi 12 mesi, anno scorso", () => {
    expect(periodoDaScelta("anno", OGGI)).toEqual({ dal: "2026-01-01", al: "2026-10-21" });
    expect(periodoDaScelta("12mesi", OGGI)).toEqual({ dal: "2025-11-01", al: "2026-10-21" });
    expect(periodoDaScelta("annoScorso", OGGI)).toEqual({ dal: "2025-01-01", al: "2025-12-31" });
    expect(periodoAnnoPrima({ dal: "2024-02-29", al: "2024-12-31" })).toEqual({ dal: "2023-02-28", al: "2023-12-31" });
    expect(mesiDelPeriodo({ dal: "2025-11-01", al: "2026-10-21" })).toHaveLength(12);
  });
  it("variazione sull'anno prima", () => {
    expect(variazione(120, 100)).toBeCloseTo(0.2);
    expect(variazione(100, 0)).toBeNull();
    expect(formatVariazione(-0.08)).toBe("−8% sull'anno prima");
  });
});

describe("analisi completa", () => {
  const ordine = (p: Partial<OrdineAcquistoRiga> & { id: string }): OrdineAcquistoRiga => ({
    supplier_id: "s1",
    order_id: null,
    issue_date: "2026-03-01",
    status: "inviato",
    subtotal: 0,
    total: 0,
    vat_total: 0,
    ...p,
  });
  const fattura = (p: Partial<FatturaRiga> & { id: string }): FatturaRiga => ({
    purchase_order_id: null,
    cedente_ragione_sociale: "Alfa Srl",
    cedente_piva: null,
    data_fattura: "2026-03-10",
    imponibile_totale: 0,
    totale_documento: 0,
    iva_totale: 0,
    tipo_documento: "TD01",
    stato: "letta",
    ...p,
  });
  const scadenza = (p: Partial<ScadenzaRiga> & { id: string }): ScadenzaRiga => ({
    supplier_id: "s1",
    due_date: "2026-10-01",
    amount: 0,
    paid_amount: 0,
    status: "da_pagare",
    is_previsionale: false,
    tipo: "pagamento_fornitore",
    ...p,
  });
  const grezzi = (p: Partial<DatiGrezziAcquisti>): DatiGrezziAcquisti => ({
    ordini: [],
    fatture: [],
    scadenze: [],
    fornitori: [
      { id: "s1", name: "Alfa", vat_number: "IT01234567890", product_category: "Edile" },
      { id: "s2", name: "Beta", vat_number: "09876543210", product_category: null },
    ],
    commesse: [{ id: "c1", order_code: "C-001", client_name: "Rossi" }],
    ...p,
  });
  const periodo = { dal: "2026-01-01", al: "2026-10-21" };

  it("ordini all'imponibile, senza bozze né annullati", () => {
    const r = calcolaAnalisiAcquisti(
      grezzi({
        ordini: [
          ordine({ id: "o1", subtotal: 1000, total: 1220, vat_total: 220 }),
          ordine({ id: "o2", subtotal: 0, total: 610, vat_total: 110 }), // subtotal mancante → 500
          ordine({ id: "o3", subtotal: 9999, status: "bozza" }),
          ordine({ id: "o4", subtotal: 9999, status: "annullato" }),
        ],
      }),
      periodo,
      {},
      OGGI,
    );
    expect(r.totali.ordinato).toBe(1500);
    expect(r.totali.numeroOrdini).toBe(2);
  });

  it("fatture: rifiutate escluse, note di credito sottratte, fornitore trovato via ordine o P.IVA", () => {
    const r = calcolaAnalisiAcquisti(
      grezzi({
        ordini: [ordine({ id: "o1", supplier_id: "s2", subtotal: 1000, order_id: "c1" })],
        fatture: [
          fattura({ id: "f1", purchase_order_id: "o1", imponibile_totale: 600 }),
          fattura({ id: "f2", cedente_piva: "01234567890", imponibile_totale: 400 }),
          fattura({ id: "f3", cedente_piva: "01234567890", imponibile_totale: 100, tipo_documento: "TD04" }),
          fattura({ id: "f4", cedente_piva: "01234567890", imponibile_totale: 5000, stato: "rifiutata" }),
        ],
      }),
      periodo,
      {},
      OGGI,
    );
    expect(r.totali.fatturato).toBe(900);
    const beta = r.fornitori.find((f) => f.supplierId === "s2")!;
    expect(beta.ordinato).toBe(1000);
    expect(beta.fatturato).toBe(600);
    expect(beta.ordinatoNonFatturato).toBe(400);
    const alfa = r.fornitori.find((f) => f.supplierId === "s1")!;
    expect(alfa.fatturato).toBe(300);
    expect(r.commesse.find((c) => c.orderId === "c1")!.fatturato).toBe(600);
  });

  it("scaduto solo con data passata, previsionali escluse; in scadenza 30 giorni a parte", () => {
    const r = calcolaAnalisiAcquisti(
      grezzi({
        scadenze: [
          scadenza({ id: "a", due_date: "2026-10-01", amount: 1000, paid_amount: 200 }),
          scadenza({ id: "b", due_date: "2026-10-01", amount: 500, is_previsionale: true }),
          scadenza({ id: "c", due_date: "2026-11-05", amount: 300 }),
          scadenza({ id: "d", due_date: "2027-03-01", amount: 700 }),
          scadenza({ id: "e", due_date: "2026-09-01", amount: 400, status: "pagato" }),
        ],
      }),
      periodo,
      {},
      OGGI,
    );
    expect(r.totali.scaduto).toBe(800);
    expect(r.totali.scadutoConteggio).toBe(1);
    expect(r.totali.inScadenza30).toBe(300);
    expect(r.scadenze.map((s) => s.id)).toEqual(["a", "c"]);
  });

  it("«Senza commessa» in cima, anno prima per mese, filtri", () => {
    const g = grezzi({
      ordini: [
        ordine({ id: "o1", subtotal: 100, order_id: "c1", issue_date: "2026-02-10" }),
        ordine({ id: "o2", subtotal: 300, order_id: null, issue_date: "2026-02-15", supplier_id: "s2" }),
        ordine({ id: "o3", subtotal: 50, order_id: "c1", issue_date: "2025-02-10" }),
      ],
    });
    const r = calcolaAnalisiAcquisti(g, periodo, {}, OGGI);
    expect(r.commesse[0].orderId).toBeNull();
    expect(r.totali.senzaCommessa).toBe(300);
    expect(r.totali.annoPrima.ordinato).toBe(50);
    const feb = r.mesi.find((m) => m.mese === "2026-02")!;
    expect(feb.ordinato).toBe(400);
    expect(feb.ordinatoAnnoPrima).toBe(50);
    expect(calcolaAnalisiAcquisti(g, periodo, { fornitoreId: "s2" }, OGGI).totali.ordinato).toBe(300);
    expect(calcolaAnalisiAcquisti(g, periodo, { commessaId: "nessuna" }, OGGI).totali.ordinato).toBe(300);
    expect(calcolaAnalisiAcquisti(g, periodo, { categoria: "Edile" }, OGGI).totali.ordinato).toBe(100);
  });
});

describe("firma → primo ordine", () => {
  it("usa la firma vera quando ci sono almeno 3 commesse firmate, altrimenti la creazione", () => {
    const righe = [1, 2, 3].map((i) => ({
      order_id: `c${i}`,
      created_at: "2026-03-11T10:00:00Z",
      commessa_creata: "2026-03-01T10:00:00Z",
      firmato_il: "2026-03-06T10:00:00Z",
    }));
    expect(calcolaFirmaPrimoOrdine(righe)).toEqual({ mediaGiorni: 5, commesse: 3, base: "firma" });
    const senza = righe.map((r) => ({ ...r, firmato_il: null as string | null }));
    expect(calcolaFirmaPrimoOrdine(senza)).toEqual({ mediaGiorni: 10, commesse: 3, base: "creazione" });
  });
});

describe("formatShare", () => {
  it("formatta quote come percentuale italiana", () => {
    expect(formatShare(0.185)).toBe("18,5%");
    expect(formatShare(Number.NaN)).toBe("0%");
  });
});
