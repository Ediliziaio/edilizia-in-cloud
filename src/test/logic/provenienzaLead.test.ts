import { describe, expect, it } from "vitest";
import {
  dominioDiReferrer,
  leggiProvenienza,
  rigaProvenienza,
} from "../../../supabase/functions/_shared/provenienzaLead.ts";

describe("provenienza del lead", () => {
  it("il click-id batte il referrer: una visita da Google Ads non è organica", () => {
    const p = leggiProvenienza({
      referrer: "https://www.google.com/",
      gclid: "Cj0KCQ",
      utm_campaign: "gestionale-edile",
    });
    expect(p.etichetta).toBe("Google Ads — gestionale-edile");
  });

  it("riconosce i motori di ricerca e li dice organici", () => {
    expect(leggiProvenienza({ referrer: "https://www.bing.com/" }).etichetta).toBe("Bing (organico)");
    expect(leggiProvenienza({ referrer: "https://www.google.com/" }).etichetta).toBe("Google (organico)");
    expect(leggiProvenienza({ referrer: "https://it.search.yahoo.com/x" }).etichetta).toBe("Yahoo (organico)");
  });

  it("riconosce le AI, che oggi portano lead come i motori", () => {
    expect(leggiProvenienza({ referrer: "https://chatgpt.com/" }).etichetta).toBe("ChatGPT");
    expect(leggiProvenienza({ referrer: "https://gemini.google.com/app" }).etichetta).toBe("Gemini");
  });

  it("le UTM vincono sul referrer quando non c'è click-id", () => {
    const p = leggiProvenienza({
      referrer: "https://www.linkedin.com/",
      utm_source: "newsletter",
      utm_medium: "email",
      utm_campaign: "novembre",
    });
    expect(p.etichetta).toBe("newsletter / email — novembre");
    expect(p.campagna).toBe("novembre");
  });

  it("un referrer sconosciuto resta il dominio, senza www", () => {
    expect(leggiProvenienza({ referrer: "https://www.marketingedile.com/blog" }).etichetta).toBe(
      "marketingedile.com",
    );
  });

  it("un referrer interno non è una provenienza", () => {
    const p = leggiProvenienza({ referrer: "https://www.ediliziaincloud.com/prezzi" }, "www.ediliziaincloud.com");
    expect(p.etichetta).toBe("Diretto (nessun referrer)");
  });

  it("senza referrer né UTM è diretto; senza sessione non è rilevata", () => {
    expect(leggiProvenienza({ referrer: null }).etichetta).toBe("Diretto (nessun referrer)");
    expect(leggiProvenienza(null).etichetta).toBe("Non rilevata");
  });

  it("la riga aggiunge le pagine viste, al singolare quando è una", () => {
    expect(rigaProvenienza(leggiProvenienza({ referrer: "https://www.bing.com/", pages_viewed: 9 }))).toBe(
      "Bing (organico) · 9 pagine viste",
    );
    expect(rigaProvenienza(leggiProvenienza({ referrer: "https://www.bing.com/", pages_viewed: 1 }))).toBe(
      "Bing (organico) · 1 pagina vista",
    );
    expect(rigaProvenienza(leggiProvenienza({ referrer: "https://www.bing.com/" }))).toBe("Bing (organico)");
  });

  it("legge il dominio anche dai referrer senza protocollo", () => {
    expect(dominioDiReferrer("fb")).toBe("fb");
    expect(dominioDiReferrer("https://m.facebook.com/x?y=1")).toBe("m.facebook.com");
    expect(dominioDiReferrer("")).toBeNull();
  });
});
