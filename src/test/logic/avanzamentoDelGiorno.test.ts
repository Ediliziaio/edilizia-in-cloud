/**
 * L'avanzamento del giorno: il conto che la griglia mostra prima di salvare, e quali righe partono.
 *
 * Le stesse regole del registro (migrazione 20290630220000): a quantità si somma col tetto alla
 * quantità di contratto, a percentuale vince la più alta, e un giorno che torna a zero toglie
 * soltanto il proprio movimento.
 */
import { describe, expect, it } from "vitest";
import { anteprimaAOggi, righeDaSalvare, valoreDelGiorno, type LavorazioneDelGiorno } from "@/lib/rendiconti/avanzamentoDelGiorno";

const aQuantita = (p: Partial<LavorazioneDelGiorno> = {}): LavorazioneDelGiorno => ({
  fase_id: "f1", fase: "Ponteggi", sottofase_id: "s1", lavorazione: "Montaggio",
  modo: "quantita", unita: "m²", quantita_contratto: 780, quantita_fatta: 180, percentuale: 23,
  a_movimenti: true, quantita_del_giorno: null, percentuale_del_giorno: null, voce_computo_id: "v1", ...p,
});
const aPercentuale = (p: Partial<LavorazioneDelGiorno> = {}): LavorazioneDelGiorno => ({
  fase_id: "f1", fase: "Opere", sottofase_id: "s2", lavorazione: "Finiture a corpo",
  modo: "percentuale", unita: null, quantita_contratto: null, quantita_fatta: null, percentuale: 40,
  a_movimenti: true, quantita_del_giorno: null, percentuale_del_giorno: null, voce_computo_id: null, ...p,
});

describe("quanto dice il giorno", () => {
  it("legge il numero nel modo in cui la lavorazione si misura", () => {
    expect(valoreDelGiorno(aQuantita({ quantita_del_giorno: 12 }))).toBe(12);
    expect(valoreDelGiorno(aPercentuale({ percentuale_del_giorno: 30 }))).toBe(30);
    expect(valoreDelGiorno(aQuantita({ percentuale_del_giorno: 99 }))).toBeNull();
  });
});

describe("il conto «diventa», a quantità", () => {
  it("si somma a quello che hanno dichiarato gli altri giorni", () => {
    expect(anteprimaAOggi(aQuantita(), 100)).toEqual({ quantita: 280, percentuale: 36 });
  });
  it("il giorno che si sta correggendo non si conta due volte", () => {
    // 180 fatti, di cui 60 dichiarati da questo giorno: portandolo a 100 si arriva a 220, non a 280.
    expect(anteprimaAOggi(aQuantita({ quantita_del_giorno: 60 }), 100)).toEqual({ quantita: 220, percentuale: 28 });
  });
  it("non si passa la quantità di contratto", () => {
    expect(anteprimaAOggi(aQuantita(), 9999)).toEqual({ quantita: 780, percentuale: 100 });
  });
  it("niente dichiarato oggi: resta quello degli altri giorni", () => {
    expect(anteprimaAOggi(aQuantita({ quantita_del_giorno: 60 }), null)).toEqual({ quantita: 120, percentuale: 15 });
  });
  it("un soffio di lavoro non è zero per cento", () => {
    expect(anteprimaAOggi(aQuantita({ quantita_fatta: 0 }), 0.5).percentuale).toBe(1);
  });
  it("tutto fatto meno un soffio non è cento per cento", () => {
    expect(anteprimaAOggi(aQuantita({ quantita_fatta: 0 }), 779.9).percentuale).toBe(99);
  });
});

describe("il conto «diventa», a percentuale", () => {
  it("vince la più alta fra quella di adesso e quella dichiarata", () => {
    expect(anteprimaAOggi(aPercentuale(), 20)).toEqual({ quantita: null, percentuale: 40 });
    expect(anteprimaAOggi(aPercentuale(), 70)).toEqual({ quantita: null, percentuale: 70 });
  });
  it("correggendo il proprio giorno si può scendere", () => {
    // La percentuale di adesso è quella che questo giorno ha dichiarato: correggerla la fa scendere.
    expect(anteprimaAOggi(aPercentuale({ percentuale: 40, percentuale_del_giorno: 40 }), 20))
      .toEqual({ quantita: null, percentuale: 20 });
  });
  it("resta fra 0 e 100", () => {
    expect(anteprimaAOggi(aPercentuale({ percentuale: 0 }), 150).percentuale).toBe(100);
    expect(anteprimaAOggi(aPercentuale({ percentuale: 0 }), null).percentuale).toBe(0);
  });
});

describe("quali righe partono", () => {
  it("solo quelle toccate, e solo se il numero cambia", () => {
    const righe = [aQuantita({ quantita_del_giorno: 10 }), aPercentuale({ percentuale_del_giorno: 30 })];
    expect(righeDaSalvare(righe, {})).toEqual([]);
    expect(righeDaSalvare(righe, { s1: 10 })).toEqual([]);
    expect(righeDaSalvare(righe, { s1: 25 })).toEqual([{ sottofase_id: "s1", quantita: 25 }]);
    expect(righeDaSalvare(righe, { s2: 55 })).toEqual([{ sottofase_id: "s2", percentuale: 55 }]);
  });
  it("il campo svuotato manda zero, che al database vuol dire «togli il mio movimento»", () => {
    expect(righeDaSalvare([aQuantita({ quantita_del_giorno: 10 })], { s1: null }))
      .toEqual([{ sottofase_id: "s1", quantita: 0 }]);
  });
  it("svuotare un campo che era già vuoto non manda niente", () => {
    expect(righeDaSalvare([aQuantita()], { s1: null })).toEqual([]);
  });
  it("manda il numero nel modo giusto, non quello sbagliato", () => {
    expect(righeDaSalvare([aPercentuale()], { s2: 15 })).toEqual([{ sottofase_id: "s2", percentuale: 15 }]);
  });
});
