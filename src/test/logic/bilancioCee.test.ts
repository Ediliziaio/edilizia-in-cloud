import { describe, expect, it } from "vitest";
import { bilancioCee, bilancioDiVerifica, htmlBilancioCee, saldiPerConto } from "@/lib/contabilita/bilancioCee";
import type { ContoContabile, Scrittura } from "@/lib/contabilita/libroGiornale";

const c = (id: string, codice: string, natura: ContoContabile["natura"], sezione: "SPA" | "SPP" | "CE", voce: string): ContoContabile => ({
  id, codice, descrizione: id, natura, sezione_cee: sezione, voce_cee: voce, mastro_id: null, movimentabile: true, attivo: true,
});
const conti = [
  c("banca", "06.01", "attivo", "SPA", "C.IV.1"),
  c("clienti", "05.01", "attivo", "SPA", "C.II.1"),
  c("attrezzature", "02.03", "attivo", "SPA", "B.II.3"),
  c("fondo", "02.92", "attivo", "SPA", "B.II.3"),
  c("capitale", "10.01", "passivo", "SPP", "A.I"),
  c("fornitori", "13.04", "passivo", "SPP", "D.7"),
  c("ivaVendite", "13.10", "passivo", "SPP", "D.12"),
  c("ricavi", "20.01", "ricavo", "CE", "A.1"),
  c("materiali", "30.01", "costo", "CE", "B.6"),
  c("ammortamento", "30.21", "costo", "CE", "B.10.b"),
  c("interessiAttivi", "40.01", "ricavo", "CE", "C.16"),
  c("interessiPassivi", "40.02", "costo", "CE", "C.17"),
];
let n = 0;
const s = (righe: Array<[string, number, number]>, data = "2026-03-01"): Scrittura => ({
  id: `s${++n}`, esercizio: 2026, numero: n, data_registrazione: data, causale: "x", descrizione: null,
  documento_numero: null, documento_data: null, origine: "manuale", storno_di: null,
  contabilita_righe: righe.map(([conto_id, dare, avere], i) => ({ riga: i + 1, conto_id, dare, avere, descrizione: null as string | null })),
});
const scritture = [
  s([["banca", 10000, 0], ["capitale", 0, 10000]]),
  s([["clienti", 12200, 0], ["ricavi", 0, 10000], ["ivaVendite", 0, 2200]]),
  s([["materiali", 4000, 0], ["fornitori", 0, 4000]]),
  s([["attrezzature", 5000, 0], ["banca", 0, 5000]]),
  s([["ammortamento", 500, 0], ["fondo", 0, 500]]),
  s([["banca", 30, 0], ["interessiAttivi", 0, 30]]),
  s([["interessiPassivi", 130, 0], ["banca", 0, 130]]),
];

describe("bilancio dalle scritture", () => {
  const saldi = saldiPerConto(scritture, conti);
  it("il bilancio di verifica quadra", () => {
    const v = bilancioDiVerifica(saldi);
    expect(v.quadra).toBe(true);
    expect(v.saldiDare).toBe(v.saldiAvere);
  });
  it("l'utile è ricavi meno costi, con la gestione finanziaria", () => {
    const b = bilancioCee(saldi);
    // 10.000 - 4.000 - 500 + 30 - 130
    expect(b.utile).toBe(5400);
  });
  it("attivo e passivo si pareggiano con l'utile nel netto, il fondo riduce le attrezzature", () => {
    const b = bilancioCee(saldi);
    expect(b.totaleAttivo).toBe(b.totalePassivo);
    expect(b.attivo.find((r) => r.codice === "B.II.3")?.valore).toBe(4500);
    expect(b.passivo.find((r) => r.codice === "A.IX")?.valore).toBe(5400);
    expect(b.vociNonIndicate).toEqual([]);
  });
  it("il foglio CEE porta le tre parti", () => {
    const html = htmlBilancioCee({ azienda: { ragione_sociale: "Prova" }, bilancio: bilancioCee(saldi), periodo: "Esercizio 2026" });
    expect(html).toContain("STATO PATRIMONIALE");
    expect(html).toContain("CONTO ECONOMICO");
    expect(html).toContain("5.400,00");
  });
  it("finoAl esclude le scritture successive", () => {
    const parziali = saldiPerConto([...scritture, s([["banca", 1, 0], ["capitale", 0, 1]], "2026-12-31")], conti, "2026-06-30");
    expect(parziali.find((x) => x.conto.id === "capitale")?.saldo).toBe(-10000);
  });
  it("un conto economico senza voce CEE entra lo stesso nell'utile, e il bilancio pareggia", () => {
    const senzaVoce: ContoContabile = { ...c("varie", "30.99", "costo", "CE", ""), sezione_cee: null, voce_cee: null };
    const strano = c("strano", "30.98", "costo", "CE", "B7");
    const tutte = [...scritture, s([["varie", 100, 0], ["banca", 0, 100]]), s([["strano", 50, 0], ["banca", 0, 50]])];
    const b = bilancioCee(saldiPerConto(tutte, [...conti, senzaVoce, strano]));
    expect(b.utile).toBe(5250);
    expect(b.totaleAttivo).toBe(b.totalePassivo);
    expect(b.contoEconomico.find((r) => r.codice === "?")?.valore).toBe(-150);
    expect(b.contoEconomico.find((r) => r.codice === "ANTE")?.valore).toBe(5250);
    expect(b.vociNonIndicate).toEqual(expect.arrayContaining(["C.E. ?", "C.E. B7"]));
  });
});
