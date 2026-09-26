import { describe, it, expect } from "vitest";
import {
  validaPiano, matchDeterministico, serveSonnet, modalitaDaBudget,
  gradinoConsentito, stimaCostoToken, SOGLIA_CONFIDENZA, type Piano,
} from "../../../supabase/functions/_shared/silvio-orchestratore-logic";

const CHIAVI = ["crea_bozza_fattura_passiva", "aggiungi_scadenza_previsionale", "invia_email"];

describe("validaPiano — solo azioni del registro", () => {
  it("piano valido con azioni note", () => {
    const p: Piano = { intento: "x", passi: [{ azione: "crea_bozza_fattura_passiva", parametri: {} }] };
    expect(validaPiano(p, CHIAVI)).toEqual({ valido: true, vuoto: false, azioniIgnote: [] });
  });
  it("piano con azione ignota → rifiutato", () => {
    const p: Piano = { intento: "x", passi: [{ azione: "cancella_tutto", parametri: {} }] };
    const r = validaPiano(p, CHIAVI);
    expect(r.valido).toBe(false);
    expect(r.azioniIgnote).toEqual(["cancella_tutto"]);
  });
  it("piano vuoto → non valido", () => {
    expect(validaPiano({ intento: "x", passi: [] }, CHIAVI)).toEqual({ valido: false, vuoto: true, azioniIgnote: [] });
  });
  it("azioni ignote deduplicate", () => {
    const p: Piano = { intento: "x", passi: [{ azione: "z", parametri: {} }, { azione: "z", parametri: {} }] };
    expect(validaPiano(p, CHIAVI).azioniIgnote).toEqual(["z"]);
  });
});

describe("matchDeterministico — gradino 0 gratis", () => {
  const cmd = { "crea la bozza di questa fattura": "crea_bozza_fattura_passiva", "aggiungi scadenza": "aggiungi_scadenza_previsionale" };
  it("riconosce comando diretto", () => expect(matchDeterministico("Crea la bozza di questa fattura", cmd)).toBe("crea_bozza_fattura_passiva"));
  it("nessun match → null (sale di gradino)", () => expect(matchDeterministico("scrivi una poesia", cmd)).toBeNull());
  it("vuoto → null", () => expect(matchDeterministico("", cmd)).toBeNull());
});

describe("serveSonnet — il modello grande è l'eccezione", () => {
  it("serve_ragionamento=true → Sonnet", () => expect(serveSonnet({ serve_ragionamento: true })).toBe(true));
  it("confidenza bassa → Sonnet", () => expect(serveSonnet({ confidenza: SOGLIA_CONFIDENZA - 0.1 })).toBe(true));
  it("confidenza alta + no ragionamento → niente Sonnet", () => expect(serveSonnet({ confidenza: 0.9 })).toBe(false));
});

describe("governo budget", () => {
  it("sotto il tetto → normale", () => expect(modalitaDaBudget(100, 1000)).toBe("normale"));
  it("oltre il tetto → conservativa", () => expect(modalitaDaBudget(1000, 1000)).toBe("conservativa"));
  it("tetto non valido → conservativa (prudente)", () => expect(modalitaDaBudget(0, 0)).toBe("conservativa"));
  it("conservativa blocca Sonnet (gradino 2)", () => {
    expect(gradinoConsentito("conservativa", 2)).toBe(false);
    expect(gradinoConsentito("conservativa", 1)).toBe(true);
    expect(gradinoConsentito("normale", 2)).toBe(true);
  });
});

describe("stimaCostoToken", () => {
  it("calcola costo per milione", () => expect(stimaCostoToken(1_000_000, 1_000_000, 1, 5)).toBe(6));
  it("zero → 0", () => expect(stimaCostoToken(0, 0)).toBe(0));
  it("negativi clampati", () => expect(stimaCostoToken(-5, -5)).toBe(0));
});
