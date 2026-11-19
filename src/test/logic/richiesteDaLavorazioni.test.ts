import { prezzoSubappalto } from "@/lib/subappaltatori/prezzoDalComputo";
import { documentoRichiestaSubappalto } from "@/lib/subappaltatori/richiestaOffertaPdf";
import { describe, expect, it } from "vitest";
import type { AffidamentoChiFaCosa } from "@/lib/subappaltatori/affidamentiCommessa";
import { aggiornaRichiesta, registroVuoto, situazioneSubappalto, type RichiestaDaLavorazioni } from "@/lib/subappaltatori/richiesteDaLavorazioni";

const richiesta: RichiestaDaLavorazioni = {
  id: "r1", dittaId: "d1", ditta: "Ditta demo", periodo: { dal: null, al: null }, creataIl: "2026-11-19",
  righe: [
    { id: "m1", ambito: "v:m1", fase: "Posa", descrizione: "Pavimento", quantita: 40, unita: "m²" },
    { id: "m2", ambito: "v:m2", fase: "Posa", descrizione: "Finiture", quantita: 10, unita: "m" },
  ],
};
const quota: AffidamentoChiFaCosa = {
  id: "a1", voce_id: "m1", subappaltatore_id: "d1", quantita: 80, prezzo_unitario: 40,
  origine_prezzo: "listino_ditta", comprende: "posa", stato: "bozza",
};
const collegamenti = { bozze: new Set<string>(), aCorpo: 0, aCorpoInBozza: 0 };

describe("stato delle voci da subappaltare", () => {
  it("mostra la bozza di richiesta e l'attesa solo dopo l'invio", () => {
    const bozza = aggiornaRichiesta(registroVuoto, richiesta);
    expect(situazioneSubappalto("v:m1", 120, bozza, [], collegamenti).stato).toBe("Richiesta in bozza");
    const inviata = aggiornaRichiesta(bozza, { ...richiesta, inviataIl: "2026-11-19" });
    expect(inviata.richieste).toHaveLength(1);
    expect(situazioneSubappalto("v:m1", 120, inviata, [], collegamenti).stato).toBe("In attesa di offerta");
  });
  it("mostra l'offerta solo sulle righe quotate e non somma richieste concorrenti", () => {
    const prima = aggiornaRichiesta(registroVuoto, { ...richiesta, inviataIl: "2026-11-19",
      offerta: { data: "2026-11-19", riferimento: "", prezzi: { m1: 45 } } });
    const registro = aggiornaRichiesta(prima, { ...richiesta, id: "r2", dittaId: "d2" });
    expect(situazioneSubappalto("v:m1", 120, registro, [], collegamenti)).toMatchObject({ stato: "Offerta ricevuta", residua: 120 });
    expect(situazioneSubappalto("v:m2", 10, registro, [], collegamenti).stato).toBe("In attesa di offerta");
  });
  it("distingue prezzo di listino, contratto in bozza e parte effettivamente a contratto", () => {
    const collegata = { ...quota, stato: "a_contratto" as const, contratto_id: "c1" };
    expect(situazioneSubappalto("v:m1", 120, registroVuoto, [quota], collegamenti)).toMatchObject({
      stato: "Affidamento in bozza", contrattata: 0, residua: 40,
    });
    expect(situazioneSubappalto("v:m1", 80, registroVuoto, [collegata], { ...collegamenti, bozze: new Set(["c1"]) })).toMatchObject({
      stato: "Contratto in bozza", contrattata: 0, inContrattoBozza: 80,
    });
    expect(situazioneSubappalto("v:m1", 120, registroVuoto, [collegata], collegamenti)).toMatchObject({
      stato: "Da quotare", contrattata: 80, residua: 40,
    });
    expect(situazioneSubappalto("v:m1", 80, registroVuoto, [collegata], collegamenti).stato).toBe("A contratto");
  });
});

describe("provenienza dei prezzi nel computo", () => {
  const base = { quantita: 10, comprende: "posa" as const, esigiPrezzoDitta: true };
  const listino = { origine: "listino_ditta", prezzo: 18.125 };
  it("precompila la sola posa da listino e tratta il costo interno come una stima", () => {
    expect(prezzoSubappalto({ ...base, proposta: listino })).toEqual({ fonte: "Listino ditta", valore: 18.13 });
    expect(prezzoSubappalto({ ...base, proposta: { origine: "costo_aziendale", prezzo: 12 } }))
      .toEqual({ fonte: "Stima aziendale · da concordare", valore: null });
    expect(prezzoSubappalto({ ...base, comprende: "fornitura_e_posa", proposta: listino }).valore).toBeNull();
  });
  it("non riusa l’offerta quando cambiano quantità o perimetro", () => {
    const affida = { ...base, offerta: { prezzo: 42, comprende: "posa" as const, quantita: 10 }, proposta: listino };
    expect(prezzoSubappalto(affida)).toEqual({ fonte: "Offerta ricevuta", valore: 42 });
    expect(prezzoSubappalto({ ...affida, quantita: 11 }).valore).toBeNull();
    expect(prezzoSubappalto({ ...affida, comprende: "fornitura_e_posa" }).fonte).toBe("Offerta da riconfermare");
    expect(prezzoSubappalto({ ...affida, quantita: 11, manuale: 44 })).toEqual({ fonte: "Inserito a mano", valore: 44 });
  });
  it("passa al modello degli acquisti soltanto i dati da inviare al subappaltatore", () => {
    const documento = documentoRichiestaSubappalto({ ...richiesta, scadenza: "2026-11-30", istruzioni: "Posa con protezioni",
      offerta: { data: "2026-11-19", riferimento: "OFF-1", prezzi: { m1: 45 } } });
    expect(documento).toMatchObject({ tipo: "richiesta", riguardaLavori: true, scadenzaOfferta: "2026-11-30", note: "Posa con protezioni" });
    expect(documento.righe[0]).toMatchObject({ gruppo: "Posa", quantita: 40, prezzo: null });
    expect(JSON.stringify(documento)).not.toContain("OFF-1");
  });
});
