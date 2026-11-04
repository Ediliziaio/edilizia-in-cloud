import { describe, expect, it } from "vitest";
import { dataAllaScadenza, dividiPerAzione, eseguiInBlocco, motivoEsclusione, type RicevutaInBlocco } from "@/lib/fatturazione/azioniInBlocco";

const riga = (patch: Partial<RicevutaInBlocco> = {}): RicevutaInBlocco => ({
  id: "f1", numero: "1", totale: 100, stato: "non_letta", tipo: "TD01", pagataIl: null, pagataSulCosto: false, verificata: false,
  stornata: false, storico: false, notaSenzaOrdine: false, conOrdine: false, scadenze: [], ...patch,
});

describe("modifiche in blocco sulle ricevute: chi resta fuori", () => {
  it("non si segnano pagate note di credito, stornate, rifiutate e già pagate", () => {
    expect(motivoEsclusione("pagate", riga())).toBeNull();
    expect(motivoEsclusione("pagate", riga({ tipo: "TD04" }))).toMatch(/non si paga/);
    expect(motivoEsclusione("pagate", riga({ stornata: true }))).toMatch(/stornata/);
    expect(motivoEsclusione("pagate", riga({ stato: "rifiutata" }))).toBe("rifiutata");
    expect(motivoEsclusione("pagate", riga({ pagataIl: "2026-01-01" }))).toBe("già pagata");
    expect(motivoEsclusione("pagate", riga({ pagataSulCosto: true }))).toBe("già pagata");
  });

  it("rimette da pagare solo chi è stata segnata pagata da qui", () => {
    expect(motivoEsclusione("da_pagare", riga({ pagataIl: "2026-01-01" }))).toBeNull();
    expect(motivoEsclusione("da_pagare", riga())).toBe("non è pagata");
    expect(motivoEsclusione("da_pagare", riga({ pagataSulCosto: true }))).toMatch(/costo/);
  });

  it("verifica: agisce solo su chi cambia davvero", () => {
    expect(motivoEsclusione("verificate", riga())).toBeNull();
    expect(motivoEsclusione("verificate", riga({ verificata: true }))).toBe("già verificata");
    expect(motivoEsclusione("da_verificare", riga({ verificata: true }))).toBeNull();
    expect(motivoEsclusione("da_verificare", riga())).toBe("già da verificare");
  });

  it("contabilizza: fuori le già fatte, lo storico e le note senza ordine", () => {
    expect(motivoEsclusione("contabilizza", riga())).toBeNull();
    expect(motivoEsclusione("contabilizza", riga({ stato: "contabilizzata" }))).toBe("già contabilizzata");
    expect(motivoEsclusione("contabilizza", riga({ storico: true }))).toMatch(/storico/);
    expect(motivoEsclusione("contabilizza", riga({ notaSenzaOrdine: true }))).toMatch(/storna/);
  });

  it("commessa: quella di un ordine d'acquisto non si cambia da qui", () => {
    expect(motivoEsclusione("commessa", riga())).toBeNull();
    expect(motivoEsclusione("commessa", riga({ conOrdine: true }))).toMatch(/ordine/);
  });

  it("conta le escluse per motivo", () => {
    const { idonee, escluse } = dividiPerAzione("pagate", [riga({ id: "a" }), riga({ id: "b", tipo: "TD04" }), riga({ id: "c", tipo: "TD04" })]);
    expect(idonee.map((r) => r.id)).toEqual(["a"]);
    expect(escluse).toEqual([{ motivo: "non si paga (nota di credito o autofattura)", quante: 2 }]);
  });
});

describe("data alla scadenza", () => {
  it("l'ultima scadenza se sono tutte passate; altrimenti, o senza scadenze, oggi", () => {
    expect(dataAllaScadenza(["2026-01-31", "2026-02-28"], "2026-11-04")).toBe("2026-02-28");
    expect(dataAllaScadenza(["2026-10-31", "2026-11-30"], "2026-11-04")).toBe("2026-11-04");
    expect(dataAllaScadenza([], "2026-11-04")).toBe("2026-11-04");
    expect(dataAllaScadenza([null], "2026-11-04")).toBe("2026-11-04");
  });
});

describe("esecuzione", () => {
  it("una che non riesce non ferma le altre, e il motivo è quello del database", async () => {
    const esito = await eseguiInBlocco([1, 2, 3], async (n) => {
      if (n === 2) throw { message: "Fattura non trovata" };
    });
    expect(esito.riuscite.sort()).toEqual([1, 3]);
    expect(esito.fallite).toEqual([{ riga: 2, motivo: "Fattura non trovata" }]);
  });
});
