import { describe, expect, it } from "vitest";
import { applyVariabili } from "../../../supabase/functions/_shared/openwaTemplate";
import { nomeSaluto } from "../../../supabase/functions/_shared/outreach-template";

/**
 * WhatsApp a freddo: {{nome}} non può mai essere la ragione sociale.
 *
 * Stesso difetto già chiuso sull'email cold (9b2cb83c6): sulle liste
 * importate first_name è quasi sempre l'insegna, non una persona
 * ("OFFICINE TABARELLI S.R.L."). "Ciao OFFICINE TABARELLI S.R.L.," su
 * WhatsApp è peggio che sull'email — è il messaggio che fa scattare il
 * dito su «Blocca» prima ancora di aprire la notifica.
 */
describe("{{nome}} nel messaggio WhatsApp", () => {
  const template = "Ciao {{nome}}, sono Flo.";

  it("con un nome di persona vero, resta", () => {
    const vars = { nome: nomeSaluto({ first_name: "Mario", company_name: "OFFICINE TABARELLI S.R.L." }) };
    expect(applyVariabili(template, vars)).toBe("Ciao Mario, sono Flo.");
  });

  it("con la ragione sociale al posto del nome, sparisce senza lasciare una virgola orfana", () => {
    const vars = { nome: nomeSaluto({ first_name: "OFFICINE TABARELLI S.R.L.", company_name: "OFFICINE TABARELLI S.R.L." }) };
    expect(applyVariabili(template, vars)).toBe("Ciao, sono Flo.");
  });

  it("con una casella di posta usata come nome («info», «amministrazione»), sparisce", () => {
    const vars = { nome: nomeSaluto({ first_name: "Amministrazione", company_name: "X S.R.L." }) };
    expect(applyVariabili(template, vars)).toBe("Ciao, sono Flo.");
  });
});
