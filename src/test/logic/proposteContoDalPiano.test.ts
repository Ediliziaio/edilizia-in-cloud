// Il conto del piano proposto per le righe di una fattura ricevuta (11/11/2026): contratto, fattura gemella, riferimenti, cespiti.
import { describe, expect, it } from "vitest";
import { proposteDalPiano, rigaPuoEssereCespite } from "@/lib/fatturazione/contoPerRiga";

const conti = [
  { id: "c1", descrizione: "CANONE LEASING CONTRATTO QX7T41058" },
  { id: "c2", descrizione: "CANONE LEASING CONTRATTO QX9R22746" },
  { id: "c3", descrizione: "SPESE ISTRUTTORIA E FINANZIAMENTO LEASING" },
  { id: "c4", descrizione: "CANONE LEASING CONTRATTO 88124477" },
  { id: "c5", descrizione: "CANONE LEASING TERNA MOD. 432 N.6610934" },
  { id: "c6", descrizione: "ASSICURAZIONI LEASING" },
];
const riga = (chiave: string, descrizione: string) => ({ chiave, descrizione });

describe("proposteDalPiano", () => {
  it("riconosce il contratto nella descrizione della riga", () => {
    expect(proposteDalPiano({ conti, storico: [], righe: [
      riga("1", "N. ctr:QX7T41058 Lotto:1 Canone (rif. Interno FLL 11Z00001) dal 2026-09-03 al 2026-10-02"),
      riga("2", "N. ctr:QX9R22746 Lotto:1 Canone dal 2026-08-12 al 2026-09-11"),
    ] })).toEqual({ "1": "conto:c1", "2": "conto:c2" });
  });

  it("due contratti con la stessa banca: la fattura gemella è quella con le stesse righe", () => {
    const storico = [
      { righe: [{ descrizione: "Canone Locazione Finanziaria - Scadenza del 01/10/2026. rata nr. 35", conto: "conto:c4" },
                { descrizione: "Indicizz. tasso passivo", conto: "conto:c4" }] },
      { righe: [{ descrizione: "Canone Locazione Finanziaria - Scadenza del 01/10/2026. rata nr. 48", conto: "conto:c1" },
                { descrizione: "Copertura assicurativa", conto: "conto:c6" }] },
    ];
    expect(proposteDalPiano({ conti, storico, righe: [
      riga("1", "Canone Locazione Finanziaria - Scadenza del 01/11/2026. rata nr. 49"), riga("2", "Copertura assicurativa"),
    ] })).toEqual({ "1": "conto:c1", "2": "conto:c6" });
    expect(proposteDalPiano({ conti, storico, righe: [
      riga("1", "Canone Locazione Finanziaria - Scadenza del 01/11/2026. rata nr. 36"), riga("2", "Indicizz. tasso passivo"),
    ] })).toEqual({ "1": "conto:c4", "2": "conto:c4" });
  });

  it("il contratto nei riferimenti della fattura vale per il canone, non per assicurazione e interessi", () => {
    expect(proposteDalPiano({ conti, storico: [], riferimenti: "900-6610934-000", righe: [
      riga("1", "Importo corrispondente al canone del 07/11/2026"), riga("2", "Assicurazione"), riga("3", "Interessi"),
    ] })).toEqual({ "1": "conto:c5" });
  });

  it("senza gemella, una descrizione che ha avuto sempre lo stesso conto; con due conti diversi, niente", () => {
    const storico = [
      { righe: [{ descrizione: "Canone Leasing", conto: "conto:c4" }, { descrizione: "Spese di incasso", conto: "conto:c3" }, { descrizione: "x", conto: null }] },
      { righe: [{ descrizione: "Canone Leasing", conto: "conto:c1" }, { descrizione: "y", conto: null }, { descrizione: "z", conto: null }] },
    ];
    expect(proposteDalPiano({ conti, storico, righe: [riga("1", "Spese di incasso 5,00"), riga("2", "Canone Leasing"), riga("3", "Bollo"), riga("4", "Altro")] }))
      .toEqual({ "1": "conto:c3" });
  });

  it("un codice in due conti, o un conto non più nel piano, non si propone", () => {
    const doppio = [...conti, { id: "c9", descrizione: "MANUTENZIONE QX7T41058" }];
    expect(proposteDalPiano({ conti: doppio, storico: [], righe: [riga("1", "ctr QX7T41058")] })).toEqual({});
    expect(proposteDalPiano({ conti, storico: [{ righe: [{ descrizione: "Canone", conto: "conto:sparito" }] }], righe: [riga("1", "Canone")] })).toEqual({});
  });
});

describe("rigaPuoEssereCespite", () => {
  it("un bene sopra 516,46 € sì; canoni, leasing, noleggi, spese e piccoli importi no", () => {
    expect(rigaPuoEssereCespite("Betoniera 350 litri", 1200)).toBe(true);
    expect(rigaPuoEssereCespite("Canone Leasing", 709.6)).toBe(false);
    expect(rigaPuoEssereCespite("Spese di incasso", 5)).toBe(false);
    expect(rigaPuoEssereCespite("Noleggio gru", 3000)).toBe(false);
    expect(rigaPuoEssereCespite("Trapano", 300)).toBe(false);
    // Un mezzo «per trasporto» è un bene; un «servizio di trasporto» no.
    expect(rigaPuoEssereCespite("Autocarro per trasporto merci", 38000)).toBe(true);
    expect(rigaPuoEssereCespite("Servizio di trasporto", 900)).toBe(false);
  });
});
