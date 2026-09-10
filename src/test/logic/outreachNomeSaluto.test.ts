/**
 * Il saluto non deve mai contenere una ragione sociale.
 *
 * Nelle liste comprate `first_name` è quasi sempre l'insegna dell'azienda:
 * senza questo filtro partirebbe «Buongiorno OFFICINE TABARELLI S.R.L.,» —
 * tre parole che dicono al destinatario che è un invio automatico.
 */
import { describe, it, expect } from "vitest";
import { nomeSaluto, contactToVars, renderTemplate } from "../../../supabase/functions/_shared/outreach-template";

describe("nomeSaluto", () => {
  it("tiene un nome di persona", () => {
    expect(nomeSaluto({ first_name: "Marco", company_name: "Rossi Serramenti" })).toBe("Marco");
    expect(nomeSaluto({ first_name: "Anna Maria", company_name: "Edil Anna" })).toBe("Anna Maria");
  });

  it("scarta le ragioni sociali travestite da nome", () => {
    for (const n of [
      "OFFICINE TABARELLI S.R.L.",
      "CACCO SERRAMENTI SRL",
      "Falegnameria Ellegi",
      "MARANGONI SCALE DI MARANGONI SERGIO",
      "BONLEX EUROPE S.R.L.",
      "Impresa Bianchi",
      "Costruzioni Verdi",
    ]) {
      expect(nomeSaluto({ first_name: n, company_name: n })).toBe("");
    }
  });

  it("scarta i nomi che sono caselle di posta", () => {
    for (const n of ["info", "Info", "amministrazione", "commerciale", "ufficio", "contatti"]) {
      expect(nomeSaluto({ first_name: n })).toBe("");
    }
  });

  it("scarta nome uguale alla ragione sociale, sigle e stringhe con simboli", () => {
    expect(nomeSaluto({ first_name: "Piai Giuseppe", company_name: "Piai Giuseppe" })).toBe("");
    expect(nomeSaluto({ first_name: "A" })).toBe("");
    expect(nomeSaluto({ first_name: "mario.rossi" })).toBe("");
    expect(nomeSaluto({ first_name: "Ditta 2000" })).toBe("");
    expect(nomeSaluto({ first_name: "" })).toBe("");
    expect(nomeSaluto({})).toBe("");
  });
});

describe("saluto renderizzato", () => {
  const template = "Buongiorno {{nome}},";

  it("con un nome vero saluta per nome", () => {
    const vars = contactToVars({ first_name: "Marco", company_name: "Rossi Serramenti" });
    expect(renderTemplate(template, vars)).toBe("Buongiorno Marco,");
  });

  it("senza nome resta «Buongiorno,» — niente spazio né virgola orfana", () => {
    const vars = contactToVars({ first_name: "CACCO SERRAMENTI SRL", company_name: "CACCO SERRAMENTI SRL" });
    expect(renderTemplate(template, vars)).toBe("Buongiorno,");
  });

  it("non saluta mai una casella di posta", () => {
    const vars = contactToVars({ first_name: "Info", company_name: "Edil Info" });
    expect(renderTemplate(template, vars)).toBe("Buongiorno,");
  });
});
