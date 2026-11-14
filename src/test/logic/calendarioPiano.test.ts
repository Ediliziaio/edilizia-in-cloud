import { describe, expect, it } from "vitest";
import { applicaCalendario, durataOperazione, gruppiCalendario, tempiProposti, tempiValidi } from "@/lib/orders/generali/calendarioPiano";
import type { VocePiano } from "@/lib/orders/generali/pianoConti";

let n = 0;
const voce = (categoria: string, importo: number, mese: string | null = null, tipo: VocePiano["tipo"] = "costo"): VocePiano => ({
  id: `v${++n}`, tipo, categoria: categoria as VocePiano["categoria"], descrizione: `${categoria} ${n}`, importo, mese,
  durataMesi: 1, figliaId: null, categorieCosto: [], aFinire: null, nota: null, ordine: n * 10, origineId: null,
});

describe("calendario rapido del piano", () => {
  it("raggruppa per categoria, ricavi prima dei costi, e conta le voci che bloccano la cassa", () => {
    const g = gruppiCalendario([
      voce("terreno", 655_000), voce("terreno", 58_950), voce("terreno", 0),
      voce("progettazione", 12_000, "2027-01"),
      voce("vendite", 365_000, null, "ricavo"), voce("vendite", 300_000, null, "ricavo"),
    ], "sviluppo");
    expect(g.map((x) => x.categoria)).toEqual(["vendite", "terreno", "progettazione"]);
    expect(g[1]).toMatchObject({ nome: "Terreno e acquisto", voci: 3, senzaMese: 2, conMese: 0, importo: 713_950 });
    expect(g[2]).toMatchObject({ senzaMese: 0, conMese: 1 });
  });

  it("propone i tempi del modello, e per le categorie che il modello non elenca quelli della sorella", () => {
    expect(tempiProposti("sviluppo", "terreno")).toEqual({ dopoMesi: 0, durataMesi: 1 });
    expect(tempiProposti("sviluppo", "vendite")).toEqual({ dopoMesi: 18, durataMesi: 8 });
    // I costi di cantiere seguono la costruzione; le spese generali tutta l'operazione.
    expect(tempiProposti("sviluppo", "materiali")).toEqual(tempiProposti("sviluppo", "costruzione"));
    expect(tempiProposti("sviluppo", "generali")).toEqual(tempiProposti("sviluppo", "finanziari"));
  });

  it("mette a ogni voce il mese d'inizio del suo gruppo e la sua durata, contando dall'inizio", () => {
    const voci = [voce("terreno", 655_000), voce("costruzione", 300_000), voce("vendite", 365_000, null, "ricavo")];
    const m = applicaCalendario(voci, "2026-11", {
      terreno: { dopoMesi: 0, durataMesi: 1 },
      costruzione: { dopoMesi: 4, durataMesi: 15 },
      vendite: { dopoMesi: 18, durataMesi: 6 },
    });
    expect(m).toEqual([
      { id: voci[0].id, mese: "2026-11", durataMesi: 1 },
      { id: voci[1].id, mese: "2027-03", durataMesi: 15 },
      { id: voci[2].id, mese: "2028-05", durataMesi: 6 },
    ]);
  });

  it("lascia stare le voci che hanno già un mese, a meno di chiederlo", () => {
    const voci = [voce("terreno", 655_000, "2026-09"), voce("terreno", 58_950)];
    const tempi = { terreno: { dopoMesi: 0, durataMesi: 1 } };
    expect(applicaCalendario(voci, "2026-11", tempi).map((x) => x.id)).toEqual([voci[1].id]);
    expect(applicaCalendario(voci, "2026-11", tempi, { ancheConMese: true }).map((x) => x.id)).toEqual([voci[0].id, voci[1].id]);
  });

  it("senza mese d'inizio o con tempi sbagliati non tocca niente", () => {
    const voci = [voce("terreno", 1), voce("oneri", 1)];
    expect(applicaCalendario(voci, "", { terreno: { dopoMesi: 0, durataMesi: 1 } })).toEqual([]);
    expect(applicaCalendario(voci, "2026-11", { terreno: { dopoMesi: 0, durataMesi: 0 }, oneri: { dopoMesi: -1, durataMesi: 2 } })).toEqual([]);
    expect(tempiValidi({ dopoMesi: 2.5, durataMesi: 3 })).toBe(false);
    expect(tempiValidi({ dopoMesi: 0, durataMesi: 121 })).toBe(false);
  });

  it("non riscrive una voce che ha già quel mese e quella durata", () => {
    const v = { ...voce("terreno", 1, "2026-11"), durataMesi: 1 };
    expect(applicaCalendario([v], "2026-11", { terreno: { dopoMesi: 0, durataMesi: 1 } }, { ancheConMese: true })).toEqual([]);
  });

  it("la durata dell'operazione è la fine del gruppo che finisce per ultimo", () => {
    expect(durataOperazione([{ dopoMesi: 0, durataMesi: 1 }, { dopoMesi: 18, durataMesi: 8 }, { dopoMesi: 1, durataMesi: 24 }])).toBe(26);
    expect(durataOperazione([])).toBe(0);
  });
});
