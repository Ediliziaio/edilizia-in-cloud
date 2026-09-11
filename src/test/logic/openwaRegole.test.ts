import { describe, it, expect } from "vitest";
import { normalizzaTesto, testoCombacia, esitoValido, primaCheScatta } from "../../../supabase/functions/_shared/openwa-regole";

describe("normalizzaTesto", () => {
  it("toglie accenti, maiuscole e punteggiatura", () => {
    expect(normalizzaTesto("Sì, GRAZIE!!")).toBe("si grazie");
    expect(normalizzaTesto("Perché no?")).toBe("perche no");
  });
  it("l'apostrofo separa le parole", () => {
    expect(normalizzaTesto("L'ho già detto")).toBe("l ho gia detto");
  });
  it("tiene le emoji", () => {
    expect(normalizzaTesto("👍")).toBe("👍");
  });
});

describe("testoCombacia", () => {
  it("any: qualsiasi risposta, anche solo un'emoji", () => {
    expect(testoCombacia("any", [], "👍")).toBe(true);
    expect(testoCombacia("any", [], "   ")).toBe(false);
  });

  it("contains: parola intera, non dentro un'altra parola", () => {
    expect(testoCombacia("contains", ["no"], "Buongiorno, chi è?")).toBe(false);
    expect(testoCombacia("contains", ["no"], "no grazie")).toBe(true);
  });

  it("contains: frasi di più parole, accenti e punteggiatura non contano", () => {
    expect(testoCombacia("contains", ["non mi interessa"], "Grazie, ma NON mi interessa!")).toBe(true);
    expect(testoCombacia("contains", ["si"], "Sì, mandami info")).toBe(true);
    expect(testoCombacia("contains", ["prezzi"], "quali sono i prezzi?")).toBe(true);
  });

  it("contains: una parola negata poco prima non conta", () => {
    expect(testoCombacia("contains", ["interessato"], "Non sono interessato, grazie")).toBe(false);
    expect(testoCombacia("contains", ["interessato"], "Sì, sono interessato")).toBe(true);
    expect(testoCombacia("contains", ["mi interessa"], "no guardi, non mi interessa")).toBe(false);
  });

  it("contains: la frase negativa si trova così com'è", () => {
    expect(testoCombacia("contains", ["non mi interessa"], "Guardi, non mi interessa proprio")).toBe(true);
  });

  it("contains: basta un'occorrenza non negata", () => {
    expect(testoCombacia("contains", ["interessato"], "non ero interessato, ma ora sono interessato")).toBe(true);
  });

  it("equals: tutto il messaggio", () => {
    expect(testoCombacia("equals", ["ok"], "Ok!")).toBe(true);
    expect(testoCombacia("equals", ["ok"], "ok ci sentiamo")).toBe(false);
  });

  it("starts_with: comincia con la parola, non con un pezzo di parola", () => {
    expect(testoCombacia("starts_with", ["stop"], "STOP grazie")).toBe(true);
    expect(testoCombacia("starts_with", ["no"], "nome e cognome?")).toBe(false);
  });

  it("senza parole chiave una regola a parole non scatta mai", () => {
    expect(testoCombacia("contains", [], "qualsiasi cosa")).toBe(false);
    expect(testoCombacia("contains", ["  ", ""], "qualsiasi cosa")).toBe(false);
  });
});

describe("primaCheScatta (SE / ALTRIMENTI SE)", () => {
  const regole = [
    { id: "no", enabled: true, match_type: "contains", match_keywords: ["non mi interessa", "no grazie"] },
    { id: "spenta", enabled: false, match_type: "contains", match_keywords: ["prezzo"] },
    { id: "prezzi", enabled: true, match_type: "contains", match_keywords: ["prezzo", "quanto costa"] },
    { id: "si", enabled: true, match_type: "contains", match_keywords: ["interessato", "ok"] },
    { id: "altro", enabled: true, match_type: "any", match_keywords: [] },
  ];

  it("decide la prima che combacia, non tutte", () => {
    expect(primaCheScatta(regole, "ok, ma non mi interessa")?.id).toBe("no");
  });

  it("salta le regole spente", () => {
    expect(primaCheScatta(regole, "che prezzo fate?")?.id).toBe("prezzi");
  });

  it("la negazione manda avanti alla regola giusta", () => {
    expect(primaCheScatta(regole, "non sono interessato")?.id).toBe("altro");
    expect(primaCheScatta(regole, "sono interessato")?.id).toBe("si");
  });

  it("senza regola che combaci: null", () => {
    expect(primaCheScatta(regole.slice(0, 4), "buongiorno")).toBeNull();
  });
});

describe("esitoValido", () => {
  it("solo le colonne esito della bacheca", () => {
    expect(esitoValido("appuntamento")).toBe(true);
    expect(esitoValido("non_interessato")).toBe(true);
    expect(esitoValido("risposto")).toBe(false);
    expect(esitoValido(null)).toBe(false);
  });
});
