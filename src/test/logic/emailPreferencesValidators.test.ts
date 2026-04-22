// ============================================================================
// emailPreferencesValidators.test — FASE 11
// ============================================================================
import { describe, it, expect } from "vitest";
import {
  isValidHexColor,
  isValidSenderPrefix,
  isValidEmail,
  isValidLogoUrl,
  validatePreferences,
} from "@/lib/email/preferencesValidators";

describe("isValidHexColor", () => {
  it("accetta HEX 6 cifre maiuscole e minuscole", () => {
    expect(isValidHexColor("#FF8800")).toBe(true);
    expect(isValidHexColor("#ff8800")).toBe(true);
    expect(isValidHexColor("#aBcDeF")).toBe(true);
    expect(isValidHexColor("#000000")).toBe(true);
    expect(isValidHexColor("#FFFFFF")).toBe(true);
  });

  it("rifiuta HEX 3 cifre (non supportato)", () => {
    expect(isValidHexColor("#F80")).toBe(false);
  });

  it("rifiuta HEX senza #", () => {
    expect(isValidHexColor("FF8800")).toBe(false);
  });

  it("rifiuta caratteri non-hex", () => {
    expect(isValidHexColor("#GGGGGG")).toBe(false);
    expect(isValidHexColor("#FF 800")).toBe(false);
  });

  it("rifiuta stringa vuota o spazi", () => {
    expect(isValidHexColor("")).toBe(false);
    expect(isValidHexColor("   ")).toBe(false);
  });

  it("rifiuta HEX 8 cifre (alpha channel non supportato)", () => {
    expect(isValidHexColor("#FF8800FF")).toBe(false);
  });
});

describe("isValidSenderPrefix", () => {
  it("accetta lowercase a-z0-9._-", () => {
    expect(isValidSenderPrefix("noreply")).toBe(true);
    expect(isValidSenderPrefix("info.azienda")).toBe(true);
    expect(isValidSenderPrefix("notifiche_2026")).toBe(true);
    expect(isValidSenderPrefix("a-b-c")).toBe(true);
    expect(isValidSenderPrefix("a")).toBe(true);
  });

  it("rifiuta uppercase", () => {
    expect(isValidSenderPrefix("NoReply")).toBe(false);
  });

  it("rifiuta spazi", () => {
    expect(isValidSenderPrefix("no reply")).toBe(false);
  });

  it("rifiuta caratteri speciali non consentiti", () => {
    expect(isValidSenderPrefix("noreply@")).toBe(false);
    expect(isValidSenderPrefix("noreply!")).toBe(false);
    expect(isValidSenderPrefix("no+reply")).toBe(false);
  });

  it("rifiuta vuoto", () => {
    expect(isValidSenderPrefix("")).toBe(false);
  });

  it("rifiuta prefix troppo lunghi (> 30 char)", () => {
    expect(isValidSenderPrefix("a".repeat(30))).toBe(true);
    expect(isValidSenderPrefix("a".repeat(31))).toBe(false);
  });
});

describe("isValidEmail", () => {
  it("accetta email semplici", () => {
    expect(isValidEmail("info@ediliziaincloud.it")).toBe(true);
    expect(isValidEmail("support+ticket@example.com")).toBe(true);
    expect(isValidEmail("a@b.c")).toBe(true);
  });

  it("rifiuta email senza @", () => {
    expect(isValidEmail("info-ediliziaincloud.it")).toBe(false);
  });

  it("rifiuta email senza TLD", () => {
    expect(isValidEmail("info@ediliziaincloud")).toBe(false);
  });

  it("rifiuta vuoto", () => {
    expect(isValidEmail("")).toBe(false);
  });

  it("rifiuta spazi", () => {
    expect(isValidEmail("info @azienda.it")).toBe(false);
  });
});

describe("isValidLogoUrl", () => {
  it("accetta vuoto (opzionale)", () => {
    expect(isValidLogoUrl("")).toBe(true);
    expect(isValidLogoUrl("   ")).toBe(true);
  });

  it("accetta https:// URL", () => {
    expect(isValidLogoUrl("https://example.com/logo.png")).toBe(true);
    expect(isValidLogoUrl("HTTPS://CDN.AZIENDA.IT/logo.svg")).toBe(true);
  });

  it("rifiuta http:// non sicuro", () => {
    expect(isValidLogoUrl("http://example.com/logo.png")).toBe(false);
  });

  it("rifiuta URL relativi", () => {
    expect(isValidLogoUrl("/logo.png")).toBe(false);
    expect(isValidLogoUrl("logo.png")).toBe(false);
  });
});

describe("validatePreferences (aggregate)", () => {
  const VALID = {
    primary_color: "#004D98",
    secondary_color: "#F5F5F5",
    sender_prefix: "noreply",
    reply_to_email: "info@azienda.it",
    logo_url: "https://cdn.azienda.it/logo.png",
  };

  it("allValid=true quando tutti i campi sono validi", () => {
    const r = validatePreferences(VALID);
    expect(r.allValid).toBe(true);
  });

  it("allValid=false se anche un singolo campo è invalido", () => {
    expect(validatePreferences({ ...VALID, primary_color: "FF8800" }).allValid).toBe(false);
    expect(validatePreferences({ ...VALID, sender_prefix: "INVALID" }).allValid).toBe(false);
    expect(validatePreferences({ ...VALID, reply_to_email: "not-an-email" }).allValid).toBe(false);
    expect(validatePreferences({ ...VALID, logo_url: "http://insecure.com/logo.png" }).allValid).toBe(false);
  });

  it("logoUrl vuoto è accettato (campo opzionale)", () => {
    const r = validatePreferences({ ...VALID, logo_url: "" });
    expect(r.logoUrl).toBe(true);
    expect(r.allValid).toBe(true);
  });

  it("restituisce flag individuali corretti", () => {
    const r = validatePreferences({
      ...VALID,
      primary_color: "invalid",
      reply_to_email: "also-invalid",
    });
    expect(r.primaryColor).toBe(false);
    expect(r.secondaryColor).toBe(true);
    expect(r.replyTo).toBe(false);
    expect(r.senderPrefix).toBe(true);
    expect(r.allValid).toBe(false);
  });
});
