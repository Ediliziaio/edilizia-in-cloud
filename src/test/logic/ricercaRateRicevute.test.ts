import { describe, expect, it } from "vitest";
import { corrispondeRicercaRicevute, terminiRicercaRicevute } from "@/lib/fatturazione/ricercaRicevute";
import { filtraRateFornitori, ribaDaContabilizzare, righeRateFornitori, type RataFornitore } from "@/lib/fatturazione/rateFornitoriScadenzario";

describe("Ricerca fatture ricevute", () => {
  it("incrocia il nome del fornitore con il riferimento nelle note", () => {
    expect(corrispondeRicercaRicevute(terminiRicercaRicevute("  BNP   GH09 "), ["BNP Leasing", "Canone mezzo GH-09"])).toBe(true);
    expect(corrispondeRicercaRicevute(terminiRicercaRicevute("GH-09 BNP"), ["BNP Leasing", "Canone mezzo GH09"])).toBe(true);
    expect(corrispondeRicercaRicevute(terminiRicercaRicevute("BNP GH09"), ["BNP Leasing", "Canone mezzo GH08"])).toBe(false);
  });

  it("mantiene la ricerca per numero e trova anche i riferimenti collegati", () => {
    expect(corrispondeRicercaRicevute(terminiRicercaRicevute(" 70/2026 "), ["70/2026"])).toBe(true);
    expect(corrispondeRicercaRicevute(terminiRicercaRicevute("70/2026"), ["170/2026", "Canone 70", "2026"])).toBe(false);
    expect(corrispondeRicercaRicevute(terminiRicercaRicevute("ODA-2026-028"), ["ODA / 2026 / 028"])).toBe(true);
    expect(corrispondeRicercaRicevute(terminiRicercaRicevute("lazzaro scuola"), ["F.lli Lazzaro", "materiali Scuòla"])).toBe(true);
  });
});

describe("Rate Ri.Ba. da esportare", () => {
  const fatture_ricevute = { id: "f1", cedente_ragione_sociale: "Test fornitore", numero_fattura: "001/2026" };
  const rata = (numero: number, scadenza: string, stato = "da_pagare", metodo = "riba"): RataFornitore =>
    ({ id: String(numero), fatture_ricevute, numero, scadenza, importo: 215.45, residuo: 215.45, stato, metodo, pagata_il: null, fornitore: "Test fornitore" });

  it("filtra per giorno della singola rata, metodo e stato aperto", () => {
    const rate = [
      rata(1, "2026-10-30"), rata(2, "2026-11-30"), rata(3, "2026-12-30"),
      rata(4, "2026-11-30", "pagata"), rata(5, "2026-11-30", "richiamata"),
      rata(6, "2026-11-30", "da_pagare", "bonifico"),
    ];
    const filtri = { anno: "2025", da: "2026-11-30", a: "2026-11-30", soloAperte: true, soloRiba: true, cerca: "" };
    const filtrate = filtraRateFornitori(rate, filtri);
    expect(filtrate.map(r => r.numero)).toEqual([2]);
    expect(righeRateFornitori(filtrate)).toEqual([
      { data: "2026-11-30", fornitore: "Test fornitore", fattura: "001/2026", numero: "2", metodo: "Ri.Ba.", importo: "215,45", aperto: "215,45", stato: "da pagare", pagata: "" },
    ]);
    expect(filtraRateFornitori(rate, { ...filtri, soloAperte: false }).map(r => r.numero)).toEqual([2, 4, 5]);
  });

  it("esporta il residuo di una rata parziale ed esclude quelle saldate da prima nota", () => {
    const parziale = { ...rata(1, "2026-11-30"), residuo: 115.45 };
    const saldata = { ...rata(2, "2026-11-30"), residuo: 0 };
    expect(righeRateFornitori([parziale, saldata])).toMatchObject([
      { aperto: "115,45", importo: "215,45", stato: "pagamento parziale" },
      { aperto: "0,00", importo: "215,45", stato: "saldato da prima nota" },
    ]);
    expect(filtraRateFornitori([parziale, saldata], {
      anno: "2026", da: "", a: "", soloAperte: true, soloRiba: true, cerca: "001/2026 TEST",
    })).toEqual([parziale]);
  });

  it("espone le rate dall’XML anche prima di registrare il costo, conservandone la posizione", () => {
    const piano: Array<{ modalita: string; scadenza: string; importo: number | null; pagata_il?: string }> = [
      { modalita: "MP05", scadenza: "2026-10-30", importo: 100 },
      { modalita: "MP12", scadenza: "2026-11-30", importo: 120 },
      { modalita: "MP12", scadenza: "2026-12-30", importo: null, pagata_il: "2026-12-30" },
    ];
    const fattura: Parameters<typeof ribaDaContabilizzare>[0] = {
      ...fatture_ricevute, tipo_documento: "TD01", pagata_il: null, piano_pagamento: piano,
    };
    expect(ribaDaContabilizzare(fattura)).toMatchObject([
      { numero: 2, stato: "da_contabilizzare", importo: 120, scadenza: "2026-11-30" },
      { numero: 3, stato: "pagata", importo: null, scadenza: "2026-12-30" },
    ]);
    expect(ribaDaContabilizzare({ ...fattura, tipo_documento: "TD04" })).toEqual([]);
  });
  it("non interpreta date impossibili come scadenze o come pagamenti confermati", () => {
    expect(ribaDaContabilizzare({
      ...fatture_ricevute, tipo_documento: "TD01", pagata_il: "9999-12-31",
      piano_pagamento: [{ modalita: "MP12", scadenza: "2026-11-31", importo: 120, pagata_il: "2026-02-30" }],
    })).toMatchObject([{ scadenza: null, pagata_il: null, stato: "da_contabilizzare", residuo: 120 }]);
  });
});
