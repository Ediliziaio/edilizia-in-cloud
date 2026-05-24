import { describe, expect, it } from "vitest";
import {
  clampSignatureExpiryDays,
  validateFirmaSignerFields,
  validateRichiediFirmaForm,
} from "@/lib/fea/richiediFirmaValidation";

describe("richiedi firma validation", () => {
  it("blocks signature requests when the document PDF is missing", () => {
    const result = validateRichiediFirmaForm({
      email: "cliente@example.com",
      nome: "Mario Rossi",
      documentoId: "quote-1",
      scadenzaGiorni: 14,
      pdfMissing: true,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("PDF");
  });

  it("requires a complete email address and firmatario name", () => {
    expect(
      validateRichiediFirmaForm({
        email: "cliente@",
        nome: "Mario Rossi",
        documentoId: "quote-1",
        scadenzaGiorni: 14,
      }),
    ).toMatchObject({ ok: false, error: "Email firmatario non valida" });

    expect(
      validateRichiediFirmaForm({
        email: "cliente@example.com",
        nome: "  ",
        documentoId: "quote-1",
        scadenzaGiorni: 14,
      }),
    ).toMatchObject({ ok: false, error: "Nome e cognome firmatario sono obbligatori" });
  });

  it("trims payload values and clamps expiry days", () => {
    expect(
      validateRichiediFirmaForm({
        email: "  CLIENTE@Example.com  ",
        nome: "  Mario Rossi  ",
        documentoId: "  quote-1  ",
        scadenzaGiorni: 999,
      }),
    ).toEqual({
      ok: true,
      payload: {
        signer_email: "cliente@example.com",
        signer_name: "Mario Rossi",
        documento_id: "quote-1",
        scadenza_giorni: 60,
      },
    });
  });

  it("falls back to 14 days and never returns values outside 1-60", () => {
    expect(clampSignatureExpiryDays("abc")).toBe(14);
    expect(clampSignatureExpiryDays(0)).toBe(1);
    expect(clampSignatureExpiryDays(-5)).toBe(1);
    expect(clampSignatureExpiryDays(61)).toBe(60);
    expect(clampSignatureExpiryDays(30)).toBe(30);
  });

  it("normalizes shared signer fields for every FEA request dialog", () => {
    expect(
      validateFirmaSignerFields({
        email: "  Studio@Example.it ",
        nome: "  Studio Rossi  ",
        scadenzaGiorni: "90",
      }),
    ).toEqual({
      ok: true,
      payload: {
        signer_email: "studio@example.it",
        signer_name: "Studio Rossi",
        scadenza_giorni: 60,
      },
    });
  });
});
