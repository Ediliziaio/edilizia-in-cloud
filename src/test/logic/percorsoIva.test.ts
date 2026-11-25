import { describe, expect, it } from "vitest";
import { passoAttuale, percorsoIva, periodiFiniti, type DatiPercorsoIva } from "@/lib/contabilita/percorsoIva";

const OGGI = "2026-11-23";
const base: DatiPercorsoIva = {
  impostazioniCompilate: true, periodicita: "mensile", acquistiSenzaRicezione: 0, senzaImporti: [],
  lipe: [], lipeRegistrate: 0, f24Iva: { daPagare: 0, pagati: 0 },
};
const stati = (d: DatiPercorsoIva) => Object.fromEntries(percorsoIva(d, 2026, OGGI).map((p) => [p.chiave, p.stato]));
const lipe = (mesi: number[], daVersare = true) => mesi.map((m) => {
  const mm = String(m).padStart(2, "0");
  return { dal: `2026-${mm}-01`, al: new Date(Date.UTC(2026, m, 0)).toISOString().slice(0, 10), daVersare };
});

describe("periodi finiti", () => {
  it("mensile: i mesi chiusi prima di oggi", () => {
    expect(periodiFiniti(2026, "mensile", OGGI).map((p) => p.nome)).toEqual(
      ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre"].map((m) => `${m} 2026`));
  });
  it("trimestrale: i trimestri chiusi; un anno passato li ha tutti", () => {
    expect(periodiFiniti(2026, "trimestrale", OGGI)).toHaveLength(3);
    expect(periodiFiniti(2025, "trimestrale", OGGI)).toHaveLength(4);
  });
});

describe("percorso guidato IVA", () => {
  it("un anno importato e mai liquidato: si parte dalle impostazioni", () => {
    const passi = percorsoIva({
      ...base, impostazioniCompilate: false, periodicita: null, acquistiSenzaRicezione: 732,
      senzaImporti: [{ data: "2026-01-10", lato: "emesse" }, { data: "2026-07-03", lato: "ricevute" }], lipe: [], f24Iva: { daPagare: 0, pagati: 0 },
    }, 2026, OGGI);
    expect(passi.map((p) => p.stato)).toEqual(["da_fare", "da_fare", "avviso", "in_attesa", "in_attesa", "in_attesa"]);
    expect(passoAttuale(passi)?.chiave).toBe("impostazioni");
    expect(passi[1].dettaglio).toMatch(/^732 fatture ricevute sono senza data di ricezione SDI/);
    expect(passi[2].dettaglio).toMatch(/1 emessa e 1 ricevuta col solo totale \(gennaio, luglio\)/);
  });

  it("le LIPE dicono quante ne mancano e qual è la prossima", () => {
    const passi = percorsoIva({ ...base, lipe: lipe([1, 2, 3]) }, 2026, OGGI);
    const p = passi.find((x) => x.chiave === "lipe")!;
    expect(p.stato).toBe("da_fare");
    expect(p.dettaglio).toBe("3 di 10 periodi già finiti confermati. Prossimo: aprile 2026.");
    expect(p.azione).toEqual({ etichetta: "Conferma aprile", vai: "lipe" });
  });

  it("le LIPE confermate e non registrate portano al giroconto", () => {
    const d = { ...base, lipe: lipe([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), lipeRegistrate: 8 };
    expect(stati(d)).toMatchObject({ lipe: "fatto", contabilita: "da_fare" });
    expect(passoAttuale(percorsoIva(d, 2026, OGGI))?.azione).toEqual({ etichetta: "Registra", vai: "giroconto" });
  });

  it("F24: da pagare, o liquidazioni da versare senza F24", () => {
    const tutte = lipe([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(percorsoIva({ ...base, lipe: tutte, lipeRegistrate: 10, f24Iva: { daPagare: 1, pagati: 8 } }, 2026, OGGI).at(-1)?.dettaglio)
      .toBe("1 F24 IVA da pagare · 1 liquidazione da versare senza F24");
    expect(stati({ ...base, lipe: tutte, lipeRegistrate: 10, f24Iva: { daPagare: 0, pagati: 10 } })).toEqual({
      impostazioni: "fatto", ricezione: "fatto", documenti: "fatto", lipe: "fatto", contabilita: "fatto", f24: "fatto",
    });
  });

  it("gli avvisi non fermano il percorso; senza permesso sulle LIPE il passo resta da fare", () => {
    const passi = percorsoIva({ ...base, senzaImporti: [{ data: "2026-02-01", lato: "ricevute" }], lipe: null }, 2026, OGGI);
    expect(passi.find((p) => p.chiave === "documenti")?.stato).toBe("avviso");
    expect(passoAttuale(passi)?.chiave).toBe("lipe");
  });
});
