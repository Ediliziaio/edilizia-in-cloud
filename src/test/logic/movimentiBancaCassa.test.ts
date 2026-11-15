/**
 * I movimenti di banca nel rendiconto di cassa (14/11/2026): i flussi 1, 10,
 * 13 e 15 del capitolato — una spesa senza fattura e senza prima nota entra
 * nel consuntivo, la categoria confermata vince, una scrittura gemella non
 * raddoppia, il saldo quadra con la banca.
 */
import { describe, expect, it } from "vitest";
import { dividiNelleQuote, uniscMovimentiBanca, type MovimentoBancaCassa, type QuotaBancaCassa } from "@/lib/controlloGestione/movimentiBancaCassa";
import { costruisciRendiconto, type MovimentoRegistrato } from "@/lib/controlloGestione/rendicontoCassa";

const banca = (p: Partial<MovimentoBancaCassa> & { id: string; cents: number }): MovimentoBancaCassa => ({
  data: "2026-03-10",
  categoria: null,
  descrizione: "mov",
  controparte: null,
  in_prima_nota: false,
  voce: null,
  ...p,
});
const pn = (p: Partial<MovimentoRegistrato> & { id: string; amount: number }): MovimentoRegistrato => ({
  direction: "uscita",
  entry_date: "2026-03-10",
  category: null,
  ...p,
});
const rendiconto = (registrati: MovimentoRegistrato[]) =>
  costruisciRendiconto({
    anno: 2025,
    today: "2026-11-14",
    saldoOggiCents: 0,
    saldoFonte: "banca",
    registrati: registrati.map((r) => ({ ...r, entry_date: r.entry_date.replace("2026", "2025") })),
    flussoDopoAnnoCents: 0,
    previsti: null,
    ipotesi: { includeOverdueIncome: false, includeOverdueExpense: false, includeEstimates: true },
  });

describe("un movimento di banca senza prima nota", () => {
  it("entra nel consuntivo (prima spariva) e senza categoria va in «Da classificare»", () => {
    const u = uniscMovimentiBanca([], [banca({ id: "t1", cents: -780000 })]);
    expect(u.daBanca).toBe(1);
    const r = rendiconto(u.registrati);
    expect(r.righe.usc_da_classificare[2]).toBe(-780000);
    expect(r.gruppi.uscite[2]).toBe(-780000);
    expect(r.nonClassificati).toEqual({ numero: 1, cents: -780000 });
  });

  it("con una categoria confermata va nella riga della categoria", () => {
    const u = uniscMovimentiBanca([], [banca({ id: "t1", cents: -48000, voce: { id: "v", nome: "Quota capitale leasing", codice: "18.02", in: null, out: "fin_leasing", origine: "manuale" } })]);
    const r = rendiconto(u.registrati);
    expect(r.righe.fin_leasing[2]).toBe(-48000);
    expect(r.righe.usc_da_classificare[2]).toBe(0);
    expect(r.nonClassificati.numero).toBe(0);
  });
});

describe("un movimento già in prima nota", () => {
  it("la categoria confermata sul movimento vince sul testo copiato in prima nota", () => {
    const registrati = [pn({ id: "p1", amount: 480, category: "Veicoli", bankTransactionId: "t1" })];
    const u = uniscMovimentiBanca(registrati, [
      banca({ id: "t1", cents: -48000, in_prima_nota: true, voce: { id: "v", nome: "Quota capitale leasing", codice: "18.02", in: null, out: "fin_leasing", origine: "manuale" } }),
    ]);
    expect(u.registrati).toHaveLength(1);
    const r = rendiconto(u.registrati);
    expect(r.righe.fin_leasing[2]).toBe(-48000);
    expect(r.righe.usc_mezzi[2]).toBe(0);
  });

  it("non si conta due volte: la riga è quella della prima nota", () => {
    const registrati = [pn({ id: "p1", amount: 100, category: "carburante", bankTransactionId: "t1" })];
    const u = uniscMovimentiBanca(registrati, [banca({ id: "t1", cents: -10000, in_prima_nota: true })]);
    expect(u.registrati).toHaveLength(1);
    expect(u.daBanca).toBe(0);
  });
});

describe("una scrittura gemella non collegata", () => {
  it("stesso verso, stesso importo, entro 5 giorni: il movimento di banca resta fuori e si dice", () => {
    const registrati = [pn({ id: "p1", amount: 1800, entry_date: "2026-03-08" })];
    const u = uniscMovimentiBanca(registrati, [banca({ id: "t1", cents: -180000, data: "2026-03-10" })]);
    expect(u.registrati).toHaveLength(1);
    expect(u.forseDoppi).toEqual({ numero: 1, cents: -180000 });
  });

  it("una scrittura gemella vale per un movimento solo", () => {
    const registrati = [pn({ id: "p1", amount: 50 })];
    const u = uniscMovimentiBanca(registrati, [banca({ id: "t1", cents: -5000 }), banca({ id: "t2", cents: -5000 })]);
    expect(u.daBanca).toBe(1);
    expect(u.forseDoppi.numero).toBe(1);
  });

  it("verso diverso, importo diverso o troppo lontana: non è gemella", () => {
    const registrati = [
      pn({ id: "a", amount: 50, direction: "entrata" }),
      pn({ id: "b", amount: 51 }),
      pn({ id: "c", amount: 50, entry_date: "2026-04-30" }),
    ];
    const u = uniscMovimentiBanca(registrati, [banca({ id: "t1", cents: -5000 })]);
    expect(u.daBanca).toBe(1);
    expect(u.forseDoppi.numero).toBe(0);
  });
});

describe("quadratura con la banca", () => {
  it("il flusso dell'anno è la somma di prima nota collegata e movimenti non registrati, senza doppi", () => {
    const registrati = [
      pn({ id: "p1", amount: 1000, direction: "entrata", bankTransactionId: "t1", category: "Incassi fatture" }),
      pn({ id: "p2", amount: 300, entry_date: "2026-03-09" }),
    ];
    const u = uniscMovimentiBanca(registrati, [
      banca({ id: "t1", cents: 100000, in_prima_nota: true }),
      banca({ id: "t2", cents: -30000 }), // gemello di p2
      banca({ id: "t3", cents: -20000 }), // solo in banca
    ]);
    const r = rendiconto(u.registrati);
    const netto = r.flussoNetto.reduce((s, c) => s + c, 0);
    expect(netto).toBe(100000 - 30000 - 20000);
  });
});

describe("un movimento ripartito su più voci (15/11/2026)", () => {
  const voce: MovimentoBancaCassa["voce"] = { id: "m", nome: "Materiali edili", codice: "04.02", in: null, out: "usc_materiali", origine: "manuale" };
  const quote: QuotaBancaCassa[] = [
    { id: "m", nome: "Materiali edili", codice: "04.02", in: null, out: "usc_materiali", cents: 70000 },
    { id: "t", nome: "Trasporti", codice: "09.12", in: null, out: "usc_mezzi", cents: 30000 },
  ];

  it("senza prima nota: una riga per quota, ognuna nella sua riga del cash flow", () => {
    const u = uniscMovimentiBanca([], [banca({ id: "t1", cents: -100000, voce, quote })]);
    expect(u.registrati.map((r) => [r.id, r.amount, r.voceCassa])).toEqual([
      ["banca:t1#0", 700, "usc_materiali"],
      ["banca:t1#1", 300, "usc_mezzi"],
    ]);
    const r = rendiconto(u.registrati);
    expect(r.righe.usc_materiali[2]).toBe(-70000);
    expect(r.righe.usc_mezzi[2]).toBe(-30000);
    expect(u.daBanca).toBe(1);
  });

  it("con prima nota: la scrittura si divide nella stessa proporzione, il totale non cambia", () => {
    const registrati = [pn({ id: "p1", amount: 1000.01, category: "Materiali", bankTransactionId: "t1" })];
    const u = uniscMovimentiBanca(registrati, [banca({ id: "t1", cents: -100001, in_prima_nota: true, voce, quote })]);
    expect(u.registrati).toHaveLength(2);
    expect(u.registrati.reduce((s, r) => s + Math.round(Number(r.amount) * 100), 0)).toBe(100001);
    expect(u.registrati.map((r) => r.voceCassa)).toEqual(["usc_materiali", "usc_mezzi"]);
  });

  it("i centesimi di arrotondamento vanno alla quota più grande", () => {
    expect(dividiNelleQuote(100, [{ cents: 1 }, { cents: 1 }, { cents: 1 }])).toEqual([34, 33, 33]);
    expect(dividiNelleQuote(1001, [{ cents: 300 }, { cents: 700 }])).toEqual([300, 701]);
    expect(dividiNelleQuote(500, [])).toEqual([]);
  });
});
