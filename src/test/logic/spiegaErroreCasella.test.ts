/**
 * Gli errori delle caselle email in parole semplici (25/09/2026): niente
 * «token», «invalid_grant» o codici davanti a chi usa la posta.
 */
import { describe, expect, it } from "vitest";
import { spiegaErroreCasella } from "@/lib/email/spiegaErroreCasella";

const TECNICO = /token|invalid_grant|oauth|imap|smtp|sync|polling|\{|\}|\b4\d\d\b/i;

describe("spiegaErroreCasella", () => {
  it("il caso della foto: accesso Google scaduto o revocato", () => {
    const f = spiegaErroreCasella('token_refresh_failed: 400 { "error": "invalid_grant", "error_description": "Token has been expired or revoked." }', "gmail");
    expect(f).toBe("Google ha chiuso l'accesso a questa casella: succede quando cambi la password o togli il permesso. Premi «Riconnetti» e conferma: ci vuole un minuto.");
  });

  it("Outlook nomina Microsoft", () => {
    expect(spiegaErroreCasella("invalid_grant: AADSTS700082", "outlook")).toContain("Microsoft ha chiuso l'accesso");
  });

  it("password della casella IMAP cambiata", () => {
    expect(spiegaErroreCasella("[AUTHENTICATIONFAILED] Invalid credentials (Failure)", "imap")).toContain("La password della casella non funziona più");
  });

  it("troppe richieste: non devi fare niente", () => {
    expect(spiegaErroreCasella("gmail_list 429 rate limit exceeded", "gmail")).toContain("non devi fare niente");
  });

  it("nessun errore, nessuna frase", () => {
    expect(spiegaErroreCasella(null)).toBe("");
    expect(spiegaErroreCasella("   ")).toBe("");
  });

  it.each([
    ['token_refresh_failed: 400 { "error": "invalid_grant" }', "gmail"],
    ["[AUTHENTICATIONFAILED] Invalid credentials", "imap"],
    ["connect ETIMEDOUT 1.2.3.4:993", "imap"],
    ["gmail_get 500 backendError", "gmail"],
    ["qualcosa di mai visto", null],
  ])("«%s» diventa una frase senza parole tecniche", (errore, provider) => {
    const f = spiegaErroreCasella(errore, provider);
    expect(f.length).toBeGreaterThan(20);
    expect(TECNICO.test(f)).toBe(false);
  });
});
