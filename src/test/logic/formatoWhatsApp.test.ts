import { describe, expect, it } from "vitest";
import { adessoPerIlPrompt, formatoWhatsApp } from "../../../supabase/functions/_shared/formatoWhatsApp";

describe("testo del bot scritto per WhatsApp", () => {
  it("il grassetto del web diventa quello di WhatsApp (caso vero del 27/09)", () => {
    expect(formatoWhatsApp("**📋 LAVORI**\n• **5 cantieri** in corso\n• Valore: **€ 101.500** circa")).toBe(
      "*📋 LAVORI*\n• *5 cantieri* in corso\n• Valore: *€ 101.500* circa",
    );
  });
  it("i titoli con # diventano una riga in grassetto", () => {
    expect(formatoWhatsApp("## Incassi\ntesto")).toBe("*Incassi*\ntesto");
    expect(formatoWhatsApp("# **Merce in arrivo**")).toBe("*Merce in arrivo*");
  });
  it("i link si scrivono per intero", () => {
    expect(formatoWhatsApp("Apri [la commessa](https://app.ediliziaincloud.com/azienda/commesse/1)")).toBe(
      "Apri la commessa: https://app.ediliziaincloud.com/azienda/commesse/1",
    );
  });
  it("asterischi doppi spaiati e righe vuote in eccesso spariscono", () => {
    expect(formatoWhatsApp("Totale **€ 3.000\n\n\n\nfine  ")).toBe("Totale € 3.000\n\nfine");
  });
  it("il testo già giusto per WhatsApp resta uguale", () => {
    const giusto = "*Fatto* — rapportino di _oggi_ registrato.";
    expect(formatoWhatsApp(giusto)).toBe(giusto);
  });
});

describe("data e ora da dare al bot", () => {
  it("è in italiano e in ora italiana", () => {
    // 09:08 UTC = 11:08 in Italia (ora legale)
    expect(adessoPerIlPrompt(new Date("2026-09-27T09:08:00Z"))).toBe("OGGI: domenica 27 settembre 2026, ore 11:08 (ora italiana).");
  });
});
