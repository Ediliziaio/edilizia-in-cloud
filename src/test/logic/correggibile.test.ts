import { describe, expect, it } from "vitest";
import { emessaMaiUscita } from "@/lib/fatturazione/correggibile";

const emessa = { tipo: "fattura", stato: "emessa" };

describe("una fattura emessa che non è mai uscita", () => {
  it("si corregge: niente SDI, niente incassi", () => {
    expect(emessaMaiUscita(emessa)).toBe(true);
  });

  it("trasmessa allo SDI, in qualunque modo lo si veda: bloccata", () => {
    expect(emessaMaiUscita({ ...emessa, sdi_id_trasmissione: "T1" })).toBe(false);
    expect(emessaMaiUscita({ ...emessa, sdi_stato: "RC" })).toBe(false);
    expect(emessaMaiUscita({ ...emessa, sdi_identificativo: "12345" })).toBe(false);
  });

  it("già incassata, anche in parte: bloccata", () => {
    expect(emessaMaiUscita({ ...emessa, importo_pagato: 50 })).toBe(false);
    expect(emessaMaiUscita({ ...emessa, pagato_at: "2026-11-16T10:00:00Z" })).toBe(false);
    // Zero non è un incasso.
    expect(emessaMaiUscita({ ...emessa, importo_pagato: 0 })).toBe(true);
  });

  it("solo lo stato «emessa»: pagata, consegnata, annullata e stornata no", () => {
    for (const stato of ["pagata", "parzialmente_pagata", "consegnata", "inviata_sdi", "annullata", "stornata", "bozza"]) {
      expect(emessaMaiUscita({ ...emessa, stato })).toBe(false);
    }
  });

  it("un DDT non c'entra: allo SDI non ci va mai, resterebbe sempre aperto", () => {
    expect(emessaMaiUscita({ tipo: "ddt", stato: "emessa" })).toBe(false);
    expect(emessaMaiUscita({ tipo: "preventivo", stato: "emessa" })).toBe(false);
    expect(emessaMaiUscita({ tipo: "proforma", stato: "emessa" })).toBe(false);
  });

  it("le note di credito e gli altri documenti fiscali seguono la stessa regola", () => {
    expect(emessaMaiUscita({ tipo: "nota_credito", stato: "emessa" })).toBe(true);
    expect(emessaMaiUscita({ tipo: "fattura_pa", stato: "emessa" })).toBe(true);
  });

  it("senza tipo non si decide niente", () => {
    expect(emessaMaiUscita({ stato: "emessa" })).toBe(false);
  });
});
