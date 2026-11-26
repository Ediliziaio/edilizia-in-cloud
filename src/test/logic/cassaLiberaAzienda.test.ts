import { describe, expect, it } from "vitest";
import { cassaLiberaAzienda, fraGiorni } from "@/lib/tesoreria/cassaLiberaAzienda";

const OGGI = "2026-11-25";

describe("Cassa libera dell'azienda", () => {
  it("toglie dal saldo le uscite registrate e non pagate", () => {
    const esito = cassaLiberaAzienda({
      saldiConti: [60_000, 20_000],
      scadenzeAperte: [
        { direction: "uscita", amount: 40_000, paid_amount: 0, due_date: "2026-12-10" },
        { direction: "uscita", amount: 30_000, paid_amount: 5_000, due_date: "2027-03-01" },
      ],
      oggi: OGGI,
    });
    expect(esito.inBanca).toBe(80_000);
    expect(esito.daPagare).toBe(65_000);
    expect(esito.libera).toBe(15_000);
  });

  it("i crediti dei clienti sono contesto, non si sommano alla cassa", () => {
    const esito = cassaLiberaAzienda({
      saldiConti: [10_000],
      scadenzeAperte: [
        { direction: "entrata", amount: 50_000, paid_amount: 0, due_date: "2026-12-01" },
        { direction: "uscita", amount: 4_000, paid_amount: 0, due_date: "2026-12-01" },
      ],
      oggi: OGGI,
    });
    expect(esito.daIncassare).toBe(50_000);
    expect(esito.libera).toBe(6_000);
  });

  it("separa quello che scade entro trenta giorni e quello già scaduto", () => {
    const esito = cassaLiberaAzienda({
      saldiConti: [20_000],
      scadenzeAperte: [
        { direction: "uscita", amount: 1_000, paid_amount: 0, due_date: "2026-11-10" }, // scaduta
        { direction: "uscita", amount: 2_000, paid_amount: 0, due_date: "2026-12-20" }, // entro 30
        { direction: "uscita", amount: 5_000, paid_amount: 0, due_date: "2027-06-01" }, // lontana
        { direction: "uscita", amount: 900, paid_amount: 0, due_date: null }, // senza data
      ],
      oggi: OGGI,
    });
    expect(esito.daPagare).toBe(8_900);
    expect(esito.scadeSubito).toBe(3_000);
    expect(esito.scaduto).toBe(1_000);
    expect(esito.libera).toBe(11_100);
    expect(esito.copre).toBe(true);
  });

  it("dice che la cassa non copre quello che scade subito", () => {
    const esito = cassaLiberaAzienda({
      saldiConti: [5_000],
      scadenzeAperte: [{ direction: "uscita", amount: 9_000, paid_amount: 0, due_date: OGGI }],
      oggi: OGGI,
    });
    expect(esito.libera).toBe(-4_000);
    expect(esito.copre).toBe(false);
  });

  it("l'anticipo dei cantieri è contesto e non viene sottratto due volte", () => {
    const esito = cassaLiberaAzienda({
      saldiConti: [20_000],
      scadenzeAperte: [],
      saldiCantieriAperti: [-12_000, 4_000, -3_000],
      oggi: OGGI,
    });
    expect(esito.anticipatoDaiCantieri).toBe(15_000);
    expect(esito.libera).toBe(20_000);
  });

  it("una scadenza già saldata non pesa", () => {
    const esito = cassaLiberaAzienda({
      saldiConti: [1_000],
      scadenzeAperte: [{ direction: "uscita", amount: 500, paid_amount: 500, due_date: OGGI }],
      oggi: OGGI,
    });
    expect(esito.daPagare).toBe(0);
    expect(esito.libera).toBe(1_000);
  });

  it("conta i giorni passando di mese e di anno", () => {
    expect(fraGiorni("2026-12-20", 30)).toBe("2027-01-19");
    expect(fraGiorni("2026-11-25", 0)).toBe("2026-11-25");
  });
});
