import { describe, expect, it } from "vitest";
import {
  documentoUscita, filtraUscite, normalizzaQuadro, riepilogoCategorie, statoRata, totaliQuadro, type Uscita,
} from "@/lib/orders/quadroPagamenti";

const uscita = (p: Partial<Uscita>): Uscita => ({
  chiave: p.chiave ?? Math.random().toString(), categoria: "materiali", controparte: "Fornitore", descrizione: "x",
  riferimento: null, importo: 100, fatture: null, senza_fattura: false, ha_ricevuta: false, pagato: 0, pagato_il: null,
  residuo: 100, scadenza: null, stato: "da_pagare", ripartito: false, quota_pct: 100, origine_tipo: "costo",
  origine_id: "c1", contratto: null, maturato_lordo: null, ritenute: null, ...p,
});

describe("quadro incassi e pagamenti della commessa", () => {
  it("somma incassi, uscite, scaduti e cassa; l'ordinato senza fattura non è un debito", () => {
    const t = totaliQuadro({
      rate: [
        { id: "r1", label: "Acconto", type: "deposit", amount: 3000, is_paid: true, paid_date: "2026-03-01", expected_date: null, fattura: "1", scaduta: false },
        { id: "r2", label: "SAL", type: "balance", amount: 4000, is_paid: false, paid_date: null, expected_date: "2026-10-01", fattura: null, scaduta: true },
        { id: "r3", label: "Saldo", type: "balance", amount: 3000, is_paid: false, paid_date: null, expected_date: "2026-12-01", fattura: null, scaduta: false },
      ],
      uscite: [
        uscita({ importo: 1220, pagato: 1220, residuo: 0, stato: "pagato" }),
        uscita({ importo: 500, pagato: 200, residuo: 300, stato: "scaduto" }),
        uscita({ importo: 350, pagato: 0, residuo: 350, stato: "da_pagare", categoria: "extra", senza_fattura: true }),
        uscita({ importo: 900, pagato: 0, residuo: 900, stato: "fattura_da_arrivare", origine_tipo: "oda" }),
      ],
    });
    expect(t).toEqual({
      incassato: 3000, daIncassare: 7000, incassoScaduto: 4000,
      pagato: 1420, daPagare: 650, pagamentoScaduto: 300, impegnato: 900, cassa: 1580,
    });
  });

  it("i filtri: da pagare, scaduti, per categoria", () => {
    const u = [
      uscita({ chiave: "a", stato: "pagato" }), uscita({ chiave: "b", stato: "scaduto" }),
      uscita({ chiave: "c", categoria: "subappalti" }), uscita({ chiave: "d", categoria: "professionisti", stato: "pagato" }),
    ];
    expect(filtraUscite(u, "aperte").map((x) => x.chiave)).toEqual(["b", "c"]);
    expect(filtraUscite(u, "scadute").map((x) => x.chiave)).toEqual(["b"]);
    expect(filtraUscite(u, "professionisti").map((x) => x.chiave)).toEqual(["d"]);
    expect(filtraUscite(u, "tutte")).toHaveLength(4);
    expect(riepilogoCategorie(u).map((c) => [c.value, c.voci, c.residuo])).toEqual([
      ["materiali", 2, 200], ["subappalti", 1, 100], ["professionisti", 1, 100],
    ]);
  });

  it("dice che documento c'è dietro ogni riga", () => {
    expect(documentoUscita(uscita({ fatture: "FT 12" }))).toBe("Fattura FT 12");
    expect(documentoUscita(uscita({ senza_fattura: true, ha_ricevuta: true }))).toBe("Senza fattura · ricevuta allegata");
    expect(documentoUscita(uscita({}))).toBe("Fattura non collegata");
    expect(documentoUscita(uscita({ origine_tipo: "oda" }))).toBe("Fattura da arrivare");
    expect(documentoUscita(uscita({ origine_tipo: "subappalto", fatture: "2 SAL" }))).toBe("2 SAL");
  });

  it("legge i numeri del database anche quando arrivano come testo", () => {
    const q = normalizzaQuadro({ oggi: "2026-10-31", rate: [{ id: "r", amount: "1220.50", is_paid: false, scaduta: true }],
      sal_cliente: [], uscite: [uscita({ importo: "100" as unknown as number, pagato: "40" as unknown as number, residuo: "60" as unknown as number })], mezzi_stimati: null });
    expect(q?.rate[0].amount).toBe(1220.5);
    expect(q?.uscite[0]).toMatchObject({ importo: 100, pagato: 40, residuo: 60 });
    expect(normalizzaQuadro(null)).toBeNull();
    expect(statoRata(q!.rate[0]).label).toBe("Scaduta");
  });
});
