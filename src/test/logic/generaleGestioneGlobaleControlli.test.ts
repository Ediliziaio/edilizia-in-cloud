import { describe, expect, it } from "vitest";
import { controllaBudget, DA_STIMARE } from "@/lib/orders/generali/budgetCompletezza";
import {
  riconciliaRiga,
  type FatturaFornitura,
  type RigaOrdinata,
} from "@/lib/orders/generali/controlloForniture";
import { cassaOperazione } from "@/lib/orders/generali/cassaOperazione";
import type { ForecastMovement } from "@/lib/finance/forecastLedger";
import { quotaCostoOperazione } from "@/lib/orders/generali/costiOperazione";
import { leggiReale } from "@/lib/orders/generali/pianoLettura";
import { csvReportMensile } from "@/lib/orders/generali/reportMensileCsv";
const ordine: RigaOrdinata = {
  id: "r1",
  purchase_order_id: "po",
  description: "Mattoni",
  quantity: 10,
  quantity_received: 6,
  unit_price: 100,
  discount_percent: 0,
  line_total: 1000,
};
const fattura: FatturaFornitura = {
  id: "f1",
  numero_fattura: "123",
  company_cost_id: "c",
  purchase_order_id: "po",
  tipo_documento: "TD01",
  imponibile_totale: 600,
  stato: "contabilizzata",
  updated_at: "2026-11-11",
  righe: [{ purchase_order_item_id: "r1", quantita: 6, prezzo_unitario: 100, prezzo_totale: 600 }],
};
describe("Controlli della generale", () => {
  it("esporta anche scostamenti negativi come numeri per Excel italiano, proteggendo i testi da formule", () => {
    const csv = csvReportMensile([
      ["Società", "=1+1"],
      ["Scostamento", -1234.5],
    ]);
    expect(csv).toContain("Scostamento;-1234,5");
    expect(csv).not.toContain("Società;=1+1");
    expect(csv.startsWith("\ufeff")).toBe(true);
  });
  it("il piano non trasforma interessi futuri o ancora da confermare in costi reali", () => {
    const base = { order_id: "g", tipo: "costo", fonte: "debito", importo: 100 };
    const r = leggiReale({
      oggi: "2026-11-11",
      righe: [
        { ...base, id: "vero", data: "2026-11-01" },
        { ...base, id: "futuro", data: "2026-12-01" },
        { ...base, id: "previsto", data: "2026-11-01", descrizione: "[EIC:MOVIMENTO_PREVISTO]" },
      ],
    });
    expect(r.righe.map((r) => r.id)).toEqual(["vero"]);
  });
  it("consolida le quote della generale e delle sue unità senza duplicare il costo", () => {
    const c = {
      id: "c",
      order_id: "generale",
      allocations: [
        { order_id: "generale", pct: 30 },
        { order_id: "unita", pct: 40 },
        { order_id: "altro-cantiere", pct: 30 },
      ],
    };
    expect(quotaCostoOperazione(c, ["generale", "unita"])).toBe(0.7);
    expect(quotaCostoOperazione({ ...c, allocations: null }, ["generale", "unita"])).toBe(1);
  });
  it("non duplica consegne registrate e fatture raggiunte da più legami", () => {
    const d = {
      id: "d1",
      ddt_ricezione_id: "ddt",
      purchase_order_item_id: "r1",
      quantita: 6,
      prezzo_unitario: 100,
      importo: 600,
    };
    expect(riconciliaRiga(ordine, [d, d], [fattura, fattura])).toMatchObject({
      ricevuta: 6,
      impegnato: 1000,
      maturato: 600,
      fatturato: 600,
      daFatturare: 0,
      avvisi: [],
    });
  });
  it("espone quantità e prezzi difformi e non inventa prezzi mancanti", () => {
    expect(
      riconciliaRiga(
        ordine,
        [],
        [
          {
            ...fattura,
            righe: [
              { purchase_order_item_id: "r1", quantita: 12, prezzo_unitario: 110, prezzo_totale: 1320 },
            ],
          },
        ],
      ).avvisi,
    ).toHaveLength(2);
    expect(riconciliaRiga({ ...ordine, price_pending: true }, [], []).maturato).toBeNull();
  });
  it("le note di credito riducono il fatturato senza sommare il DDT ai costi", () => {
    const nc = {
      ...fattura,
      id: "nc",
      tipo_documento: "TD04",
      righe: [{ purchase_order_item_id: "r1", quantita: 1, prezzo_unitario: 100, prezzo_totale: 100 }],
    };
    expect(riconciliaRiga(ordine, [], [fattura, nc])).toMatchObject({
      fatturato: 500,
      qFatturata: 5,
      daFatturare: 100,
    });
  });
  it("blocca stime e mesi mancanti, accettando gli zeri confermati", () => {
    const voce = { descrizione: "Costruzione", importo: 0, mese: null as string | null, nota: DA_STIMARE };
    expect(controllaBudget([voce]).completo).toBe(false);
    expect(
      controllaBudget([
        { ...voce, nota: "Zero confermato" },
        { descrizione: "Ricavi", importo: 100, mese: "2026-12", nota: null },
      ]).completo,
    ).toBe(true);
    expect(controllaBudget([{ ...voce, nota: null }]).completo).toBe(false);
    expect(controllaBudget([{ ...voce, importo: 100, nota: null }]).completo).toBe(false);
    expect(controllaBudget([{ ...voce, importo: 100, mese: "2026-12", nota: null }]).completo).toBe(true);
  });
  it("esclude gli storni, separa il capitale dai costi e non genera cassa dagli accolli", () => {
    const base = {
      entry_date: "2026-11-01",
      amount: 122,
      direction: "uscita",
      category: "materiali",
      notes: null as string | null,
      reversal_of: null as string | null,
    };
    const c = cassaOperazione({
      oggi: "2026-11-11",
      registrati: [
        { ...base, id: "p1" },
        { ...base, id: "p2" },
        { ...base, id: "storno", reversal_of: "p2", direction: "entrata" },
      ],
      previsti: [],
      movimenti: [
        { id: "m1", fonteId: "socio", tipo: "versamento", data: "2026-11-02", importo: 1000, nota: null },
        { id: "m2", fonteId: "socio", tipo: "rimborso", data: "2026-11-03", importo: 200, nota: null },
        { id: "m3", fonteId: "banca", tipo: "accollo", data: "2026-11-03", importo: 500, nota: null },
      ],
    });
    expect(c.righe[0]).toMatchObject({
      pagato: 12200,
      incassato: 0,
      versato: 100000,
      rimborsato: 20000,
      oneriFinanziari: 0,
    });
  });
  it("il ritardo sposta soltanto gli incassi e segnala i documenti incompleti", () => {
    const m: ForecastMovement = {
      id: "inc",
      description: "Rogito",
      counterparty: "Acquirente",
      category: "clienti",
      direction: "in",
      cents: 122000,
      date: "2026-12-01",
      source: "rata",
      href: "",
      estimated: false,
    };
    const c = cassaOperazione({
      oggi: "2026-11-11",
      registrati: [],
      movimenti: [],
      ritardoMesi: 2,
      previsti: [
        m,
        { ...m, id: "pag", direction: "out" },
        { ...m, id: "no-data", date: null },
        { ...m, id: "doppio", possibleDuplicate: true },
      ],
    });
    expect(c.righe.map((r) => [r.mese, r.entrateAttese, r.usciteAttese])).toEqual([
      ["2026-12", 0, 122000],
      ["2027-02", 122000, 0],
    ]);
    expect(c).toMatchObject({ senzaData: 1, daRiconciliare: 1, fabbisogno: 122000 });
  });
});
