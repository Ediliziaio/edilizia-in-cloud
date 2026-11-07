import { describe, expect, it } from "vitest";
import { messaggioErroreGiornale, paginaDelGiorno, regoleGiornale } from "@/lib/campo/statoGiornale";

describe("regoleGiornale", () => {
  it("bozza salvata con il permesso: si modifica, si firma, si elimina, non si annota", () => {
    expect(regoleGiornale({ id: "g", stato: "bozza", lavorazioni_eseguite: "Getto" }, true))
      .toEqual({ stato: "bozza", puoModificare: true, puoFirmare: true, puoEliminare: true, puoAnnotare: false });
  });

  it("senza lavorazioni non si firma; una pagina nuova si scrive ma non si firma né si elimina", () => {
    expect(regoleGiornale({ id: "g", stato: "bozza", lavorazioni_eseguite: "  " }, true).puoFirmare).toBe(false);
    const nuova = regoleGiornale(null, true);
    expect(nuova).toMatchObject({ puoModificare: true, puoFirmare: false, puoEliminare: false, puoAnnotare: false });
  });

  it("firmata: sola lettura, solo annotazioni", () => {
    expect(regoleGiornale({ id: "g", stato: "firmata", lavorazioni_eseguite: "Getto" }, true))
      .toEqual({ stato: "firmata", puoModificare: false, puoFirmare: false, puoEliminare: false, puoAnnotare: true });
  });

  it("senza permesso non si fa niente, né in bozza né firmata", () => {
    for (const stato of ["bozza", "firmata"]) {
      const r = regoleGiornale({ id: "g", stato, lavorazioni_eseguite: "x" }, false);
      expect([r.puoModificare, r.puoFirmare, r.puoEliminare, r.puoAnnotare]).toEqual([false, false, false, false]);
    }
  });

  it("uno stato sconosciuto o assente è bozza", () => {
    expect(regoleGiornale({ id: "g" }, true).stato).toBe("bozza");
  });
});

describe("paginaDelGiorno", () => {
  const righe = [{ id: "a", order_id: "o1", data_lavori: "2026-11-07" }, { id: "b", order_id: "o2", data_lavori: "2026-11-07" }];
  it("trova la pagina dello stesso cantiere e giorno", () => {
    expect(paginaDelGiorno(righe, "o2", "2026-11-07")?.id).toBe("b");
    expect(paginaDelGiorno(righe, "o1", "2026-11-08")).toBeUndefined();
    expect(paginaDelGiorno(righe, "", "2026-11-07")).toBeUndefined();
  });
});

describe("messaggioErroreGiornale", () => {
  it("dice in chiaro il doppione e la policy; il resto passa com'è", () => {
    expect(messaggioErroreGiornale({ code: "23505", message: "duplicate key" })).toMatch(/già la pagina di questo giorno/);
    expect(messaggioErroreGiornale({ message: 'new row violates row-level security policy for table "giornale_lavori"' }))
      .toBe("Non hai il permesso di modificare il giornale dei lavori.");
    expect(messaggioErroreGiornale({ message: "Questa pagina del giornale è firmata: non si può modificare." }))
      .toBe("Questa pagina del giornale è firmata: non si può modificare.");
    expect(messaggioErroreGiornale(null)).toBe("Operazione non riuscita.");
  });
});
