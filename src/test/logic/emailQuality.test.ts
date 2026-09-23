import { describe, it, expect } from "vitest";
import { classifyEmail, isLowQuality, codaAttaccataAlDominio } from "../../../supabase/functions/_shared/email-quality";

describe("classifyEmail", () => {
  it("email business valida", () => {
    const q = classifyEmail("Marco.Rossi@Impresa-Edile.it");
    expect(q).toMatchObject({ email: "marco.rossi@impresa-edile.it", domain: "impresa-edile.it", syntaxValid: true, isRole: false, isDisposable: false, isFree: false });
  });
  it("riconosce indirizzi role", () => {
    expect(classifyEmail("info@azienda.it").isRole).toBe(true);
    expect(classifyEmail("noreply@azienda.it").isRole).toBe(true);
    expect(classifyEmail("amministrazione@azienda.it").isRole).toBe(true);
    expect(classifyEmail("mario@azienda.it").isRole).toBe(false);
  });
  it("ignora il +tag nel locale", () => {
    expect(classifyEmail("info+spam@azienda.it").isRole).toBe(true);
  });
  it("riconosce domini usa-e-getta", () => {
    expect(classifyEmail("tizio@mailinator.com").isDisposable).toBe(true);
    expect(classifyEmail("tizio@azienda.it").isDisposable).toBe(false);
  });
  it("riconosce provider gratuiti", () => {
    expect(classifyEmail("mario@gmail.com").isFree).toBe(true);
    expect(classifyEmail("mario@libero.it").isFree).toBe(true);
    expect(classifyEmail("mario@impresa.it").isFree).toBe(false);
  });
  it("sintassi non valida", () => {
    expect(classifyEmail("non-una-email").syntaxValid).toBe(false);
    expect(classifyEmail("a@b").syntaxValid).toBe(false);
  });
});

describe("isLowQuality", () => {
  it("scarta sintassi errata, role, usa-e-getta", () => {
    expect(isLowQuality(classifyEmail("non valida"))).toBe(true);
    expect(isLowQuality(classifyEmail("info@x.it"))).toBe(true);
    expect(isLowQuality(classifyEmail("a@mailinator.com"))).toBe(true);
  });
  it("tiene business e anche free (molte PMI usano gmail/libero)", () => {
    expect(isLowQuality(classifyEmail("marco@impresa.it"))).toBe(false);
    expect(isLowQuality(classifyEmail("marco@gmail.com"))).toBe(false);
  });
});

// 23/09/2026 — 47 contatti con l'indirizzo incollato alla parola dopo
// («boggeri@boggeri.itpec»): sintatticamente validi, rifiutati dal server del
// destinatario, 23 rifiuti in sette giorni a spese della reputazione.
describe("indirizzi con la coda attaccata", () => {
  it("riconosce la parola rimasta attaccata al dominio", () => {
    expect(codaAttaccataAlDominio("boggeri@boggeri.itpec")).toBe(true);
    expect(codaAttaccataAlDominio("info@serramenti.ittelefono")).toBe(true);
    expect(codaAttaccataAlDominio("mario@studio.comvoglio")).toBe(true);
    expect(codaAttaccataAlDominio("x@ditta.itrispondi")).toBe(true);
  });

  it("gli indirizzi buoni restano buoni, anche sui domini che somigliano", () => {
    expect(codaAttaccataAlDominio("mario@rossi.it")).toBe(false);
    expect(codaAttaccataAlDominio("mario@rossi.com")).toBe(false);
    expect(codaAttaccataAlDominio("mario@studio.company")).toBe(false);
    expect(codaAttaccataAlDominio("mario@negozio.computer")).toBe(false);
    expect(codaAttaccataAlDominio("mario@rete.network")).toBe(false);
    expect(codaAttaccataAlDominio("mario@posta.cloud")).toBe(false);
    expect(codaAttaccataAlDominio("senza-chiocciola")).toBe(false);
  });

  it("nel cold non ci si scrive", () => {
    expect(isLowQuality(classifyEmail("boggeri@boggeri.itpec"))).toBe(true);
    expect(classifyEmail("boggeri@boggeri.itpec").codaAttaccata).toBe(true);
    expect(isLowQuality(classifyEmail("mario@rossi.it"))).toBe(false);
  });
});
