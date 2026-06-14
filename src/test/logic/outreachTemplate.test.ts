import { describe, it, expect } from "vitest";
import {
  renderTemplate, hashSeed, extractVariables, contactToVars,
} from "../../../supabase/functions/_shared/outreach-template";

describe("renderTemplate — variabili", () => {
  it("sostituisce una variabile presente", () => {
    expect(renderTemplate("Ciao {{first_name}}", { first_name: "Mario" })).toBe("Ciao Mario");
  });
  it("gestisce spazi interni", () => {
    expect(renderTemplate("Ciao {{ first_name }}", { first_name: "Anna" })).toBe("Ciao Anna");
  });
  it("usa il fallback se vuota o assente", () => {
    expect(renderTemplate("Ciao {{first_name|amico}}", {})).toBe("Ciao amico");
    expect(renderTemplate("Ciao {{first_name|amico}}", { first_name: "" })).toBe("Ciao amico");
  });
  it("variabile mancante senza fallback → ripulisce", () => {
    expect(renderTemplate("Ciao {{first_name}}!", {})).toBe("Ciao!");
  });
  it("più variabili", () => {
    expect(renderTemplate("{{first_name}} di {{company_name}}", { first_name: "Luca", company_name: "Verdi Srl" }))
      .toBe("Luca di Verdi Srl");
  });
});

describe("renderTemplate — spintax", () => {
  it("sceglie per seed", () => {
    expect(renderTemplate("{Ciao|Salve|Buongiorno}", {}, { seed: 0 })).toBe("Ciao");
    expect(renderTemplate("{Ciao|Salve|Buongiorno}", {}, { seed: 1 })).toBe("Salve");
    expect(renderTemplate("{Ciao|Salve|Buongiorno}", {}, { seed: 2 })).toBe("Buongiorno");
  });
  it("wrappa con il modulo", () => {
    expect(renderTemplate("{a|b}", {}, { seed: 3 })).toBe("b"); // 3 % 2 = 1
  });
  it("non tocca le graffe singole senza pipe", () => {
    expect(renderTemplate("prezzo {speciale}", {})).toBe("prezzo {speciale}");
  });
  it("combina variabili e spintax", () => {
    expect(renderTemplate("{Ciao|Salve} {{first_name|}}, novità?", { first_name: "Sara" }, { seed: 0 }))
      .toBe("Ciao Sara, novità?");
  });
});

describe("hashSeed — stabile per contatto", () => {
  it("deterministico", () => {
    expect(hashSeed("mario@x.it")).toBe(hashSeed("mario@x.it"));
  });
  it("diverso per input diversi (in genere)", () => {
    expect(hashSeed("a@x.it")).not.toBe(hashSeed("b@x.it"));
  });
  it("non negativo", () => {
    expect(hashSeed("qualunque")).toBeGreaterThanOrEqual(0);
  });
});

describe("extractVariables", () => {
  it("elenca le variabili uniche", () => {
    expect(extractVariables("{{first_name}} {{company_name}} {{first_name}}").sort())
      .toEqual(["company_name", "first_name"]);
  });
  it("vuoto se nessuna", () => {
    expect(extractVariables("nessuna variabile")).toEqual([]);
  });
});

describe("contactToVars", () => {
  it("mappa i campi standard, null → stringa vuota", () => {
    expect(contactToVars({ first_name: "Mario", last_name: null, company_name: "X", email: "m@x.it" }))
      .toEqual({ first_name: "Mario", last_name: "", company_name: "X", email: "m@x.it", phone: "" });
  });
});
