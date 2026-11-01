import { describe, expect, it } from "vitest";
import {
  estrattoConto, statoFatture, totaliFornitore, variantiPartitaIva,
  type FatturaFornitore, type RataFornitore,
} from "@/lib/fornitori/estrattoConto";

const oggi = "2026-11-01";
const f = (patch: Partial<FatturaFornitore>): FatturaFornitore => ({
  id: "f1", numero_fattura: "1", data_fattura: "2026-09-01", tipo_documento: "TD01", totale_documento: 1220,
  netto_a_pagare: 1220, stato: "contabilizzata", company_cost_id: "c1", costo: { is_paid: false, paid_date: null }, ...patch,
});
const r = (patch: Partial<RataFornitore>): RataFornitore => ({
  id: "r1", fattura_ricevuta_id: "f1", company_cost_id: "c1", numero: 1, scadenza: "2026-10-31", importo: 610,
  metodo: "MP12", stato: "da_pagare", pagata_il: null, ...patch,
});

describe("scheda fornitore: stato delle fatture ed estratto conto (01/11/2026)", () => {
  it("pagata in parte con una RiBa scaduta: scaduta, col residuo giusto", () => {
    const [riga] = statoFatture([f({})], [r({ stato: "pagata", pagata_il: "2026-09-30", scadenza: "2026-09-30" }), r({ id: "r2", numero: 2 })], oggi);
    expect(riga).toMatchObject({ stato: "scaduta", pagato: 610, residuo: 610, prossimaScadenza: "2026-10-31" });
  });

  it("senza rate: pagata se il costo è pagato, da registrare se non è ancora un costo, pagata se storica", () => {
    const righe = statoFatture([
      f({ id: "a", costo: { is_paid: true, paid_date: "2026-09-10" } }),
      f({ id: "b", company_cost_id: null, costo: null, stato: "non_letta" }),
      f({ id: "c", company_cost_id: null, costo: null, storico_esterno: true }),
    ], [], oggi);
    expect(righe.map((x) => x.stato)).toEqual(["pagata", "da_registrare", "pagata"]);
  });

  it("estratto conto: fatture in avere, pagamenti e note di credito in dare, saldo progressivo", () => {
    const righe = statoFatture([
      f({}),
      f({ id: "nc", numero_fattura: "NC1", tipo_documento: "TD04", data_fattura: "2026-10-05", totale_documento: 122, netto_a_pagare: 122, company_cost_id: null, costo: null }),
    ], [r({ stato: "pagata", pagata_il: "2026-09-30", scadenza: "2026-09-30" }), r({ id: "r2", numero: 2 })], oggi);
    const conto = estrattoConto(righe);
    expect(conto.map((m) => [m.data, m.avere, m.dare, m.saldo])).toEqual([
      ["2026-09-01", 1220, 0, 1220],
      ["2026-09-30", 0, 610, 610],
      ["2026-10-05", 0, 122, 488],
    ]);
    expect(totaliFornitore(righe, oggi)).toEqual({ fatturato: 1220, pagato: 610, daPagare: 610, scaduto: 610, daRegistrare: 0, noteCredito: 122 });
  });

  it("la P.IVA si cerca con e senza IT", () => {
    expect(variantiPartitaIva("IT01234567890")).toEqual(["01234567890", "IT01234567890"]);
    expect(variantiPartitaIva("")).toEqual([]);
  });
});
