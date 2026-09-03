import { describe, it, expect } from "vitest";
import {
  eAperto,
  eInRitardo,
  margineCantieriAperti,
  andamentoIncassi,
  ordinaAttenzioni,
  type CantiereMargine,
  type VoceAttenzione,
} from "@/lib/comeStiamoAndando";

/**
 * Questa è la schermata su cui si decide se il gestionale serve. Se il margine
 * dei cantieri aperti è sbagliato, o l'incassato sembra a posto mentre non lo è,
 * si prendono decisioni sbagliate con l'aria di averle prese sui numeri.
 */

const OGGI = new Date("2026-09-15T10:00:00Z");

function cantiere(p: Partial<CantiereMargine>): CantiereMargine {
  return {
    id: "1", order_code: null, description: null, cliente_nome: null,
    margine: null, margine_perc: null, preventivo_totale: null,
    work_start_date: null, work_end_date: null,
    ...p,
  };
}

describe("eAperto", () => {
  it("cominciato e non ancora finito", () => {
    expect(eAperto({ work_start_date: "2026-09-01", work_end_date: "2026-09-30" }, OGGI)).toBe(true);
  });

  it("senza data di fine è aperto: la fine non è pianificata, non è passata", () => {
    expect(eAperto({ work_start_date: "2026-09-01", work_end_date: null }, OGGI)).toBe(true);
  });

  it("senza data di inizio NON è aperto: è un contratto, non un cantiere", () => {
    // Mescolarlo falserebbe il margine "di quello che sto facendo adesso".
    expect(eAperto({ work_start_date: null, work_end_date: "2026-12-31" }, OGGI)).toBe(false);
  });

  it("che comincia più avanti non è aperto oggi", () => {
    expect(eAperto({ work_start_date: "2026-10-01", work_end_date: null }, OGGI)).toBe(false);
  });

  it("finito ieri non è più aperto; che finisce oggi lo è ancora", () => {
    expect(eAperto({ work_start_date: "2026-08-01", work_end_date: "2026-09-14" }, OGGI)).toBe(false);
    expect(eAperto({ work_start_date: "2026-08-01", work_end_date: "2026-09-15" }, OGGI)).toBe(true);
  });
});

describe("eInRitardo", () => {
  it("cominciato e con la fine già passata", () => {
    expect(eInRitardo({ work_start_date: "2026-08-01", work_end_date: "2026-09-10" }, OGGI)).toBe(true);
  });

  it("senza fine pianificata non è in ritardo: non c'è una scadenza da mancare", () => {
    expect(eInRitardo({ work_start_date: "2026-08-01", work_end_date: null }, OGGI)).toBe(false);
  });

  it("non ancora cominciato non è in ritardo", () => {
    expect(eInRitardo({ work_start_date: null, work_end_date: "2026-01-01" }, OGGI)).toBe(false);
  });
});

describe("margineCantieriAperti", () => {
  const cantieri = [
    cantiere({ id: "a", work_start_date: "2026-09-01", work_end_date: "2026-09-30", margine: 20_000, preventivo_totale: 200_000, margine_perc: 10 }),
    cantiere({ id: "b", work_start_date: "2026-09-01", work_end_date: null, margine: 800, preventivo_totale: 2_000, margine_perc: 40 }),
    // chiuso: non deve entrare
    cantiere({ id: "c", work_start_date: "2026-01-01", work_end_date: "2026-02-01", margine: 999_999, preventivo_totale: 1, margine_perc: 99 }),
  ];

  it("conta solo gli aperti", () => {
    const m = margineCantieriAperti(cantieri, OGGI);
    expect(m.quanti).toBe(2);
    expect(m.margineEuro).toBe(20_800);
    expect(m.valoreEuro).toBe(202_000);
  });

  it("la percentuale è pesata sul valore, non la media delle percentuali", () => {
    // Media semplice: (10+40)/2 = 25%. Pesata: 20.800/202.000 ≈ 10,3%.
    // Un cantiere da 2.000 € non può contare come uno da 200.000 €.
    const m = margineCantieriAperti(cantieri, OGGI);
    expect(m.marginePerc).toBeCloseTo(10.297, 2);
  });

  it("senza valore su cui calcolare la percentuale resta null, non zero", () => {
    const m = margineCantieriAperti(
      [cantiere({ id: "x", work_start_date: "2026-09-01", margine: 0, preventivo_totale: 0 })],
      OGGI,
    );
    expect(m.marginePerc).toBeNull();
  });

  it("nessun cantiere aperto: tutto a zero e percentuale nulla", () => {
    const m = margineCantieriAperti([], OGGI);
    expect(m).toMatchObject({ quanti: 0, margineEuro: 0, valoreEuro: 0, marginePerc: null });
    expect(m.peggiori).toEqual([]);
  });

  it("i peggiori sono i primi per margine più basso, e sono solo aperti", () => {
    const m = margineCantieriAperti(cantieri, OGGI, 2);
    expect(m.peggiori.map((c) => c.id)).toEqual(["a", "b"]);
  });
});

describe("andamentoIncassi", () => {
  it("senza previsione non inventa una percentuale", () => {
    const a = andamentoIncassi(50_000, null, OGGI);
    expect(a.percentuale).toBeNull();
    expect(a.sottoRitmo).toBeNull();
    expect(a.incassato).toBe(50_000);
  });

  it("una previsione a zero vale come nessuna previsione", () => {
    expect(andamentoIncassi(10, 0, OGGI).percentuale).toBeNull();
  });

  it("mette il tempo dentro il giudizio: metà mese, metà previsione = in ritmo", () => {
    // 15 settembre su 30 giorni = metà mese.
    const a = andamentoIncassi(50_000, 100_000, OGGI);
    expect(a.meseTrascorso).toBeCloseTo(0.5, 2);
    expect(a.sottoRitmo).toBe(false);
    expect(a.percentuale).toBe(50);
    expect(a.mancante).toBe(50_000);
  });

  it("lo stesso 50% a fine mese è sotto ritmo", () => {
    const a = andamentoIncassi(50_000, 100_000, new Date("2026-09-28T10:00:00Z"));
    expect(a.sottoRitmo).toBe(true);
  });

  it("oltre la previsione: il mancante diventa negativo", () => {
    const a = andamentoIncassi(120_000, 100_000, OGGI);
    expect(a.mancante).toBe(-20_000);
    expect(a.sottoRitmo).toBe(false);
  });
});

describe("ordinaAttenzioni", () => {
  const v = (p: Partial<VoceAttenzione>): VoceAttenzione => ({
    id: "x", gravita: "informativa", titolo: "", dettaglio: "", url: "", ...p,
  });

  it("prima la gravità, poi l'importo: in cima quello che costa di più non fare", () => {
    const ordinate = ordinaAttenzioni([
      v({ id: "info", gravita: "informativa", importo: 99_999 }),
      v({ id: "urg-piccolo", gravita: "urgente", importo: 100 }),
      v({ id: "urg-grande", gravita: "urgente", importo: 10_000 }),
      v({ id: "att", gravita: "attenzione", importo: 500 }),
    ]);
    expect(ordinate.map((x) => x.id)).toEqual(["urg-grande", "urg-piccolo", "att", "info"]);
  });

  it("le voci senza importo non finiscono davanti a quelle con importo", () => {
    const ordinate = ordinaAttenzioni([
      v({ id: "senza", gravita: "urgente" }),
      v({ id: "con", gravita: "urgente", importo: 1 }),
    ]);
    expect(ordinate.map((x) => x.id)).toEqual(["con", "senza"]);
  });

  it("non modifica l'elenco che riceve", () => {
    const originale = [v({ id: "b", gravita: "informativa" }), v({ id: "a", gravita: "urgente" })];
    ordinaAttenzioni(originale);
    expect(originale.map((x) => x.id)).toEqual(["b", "a"]);
  });
});
