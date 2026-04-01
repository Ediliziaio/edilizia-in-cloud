import { describe, it, expect } from "vitest";

/**
 * Test validazione firma elettronica (SignaturePage).
 * La firma è legalmente rilevante — zero bug accettabili.
 *
 * Replica la logica di SignaturePage.tsx:
 *   const signatureData = `data:text/plain;base64,${btoa(unescape(encodeURIComponent(typedSignature.trim())))}`;
 *   const canSubmit = typedSignature.trim().length >= 2 && consent;
 */

// ─── Funzioni di validazione e encoding ──────────────────────────────────────

function canSubmitSignature(typedSignature: string, consent: boolean): boolean {
  return typedSignature.trim().length >= 2 && consent;
}

function encodeSignature(name: string): string {
  return `data:text/plain;base64,${btoa(unescape(encodeURIComponent(name.trim())))}`;
}

function decodeSignature(dataUri: string): string {
  const b64 = dataUri.replace("data:text/plain;base64,", "");
  return decodeURIComponent(escape(atob(b64)));
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe("canSubmitSignature — validazione", () => {
  it("permette firma valida con consenso", () => {
    expect(canSubmitSignature("Mario Rossi", true)).toBe(true);
  });

  it("blocca firma senza consenso", () => {
    expect(canSubmitSignature("Mario Rossi", false)).toBe(false);
  });

  it("blocca firma troppo corta (1 carattere)", () => {
    expect(canSubmitSignature("M", true)).toBe(false);
  });

  it("blocca firma vuota", () => {
    expect(canSubmitSignature("", true)).toBe(false);
  });

  it("blocca firma con soli spazi", () => {
    expect(canSubmitSignature("   ", true)).toBe(false);
  });

  it("accetta firma con esattamente 2 caratteri (minimo)", () => {
    expect(canSubmitSignature("AB", true)).toBe(true);
  });

  it("trima gli spazi iniziali/finali prima di validare", () => {
    // " A " trim → "A" = 1 char → blocca
    expect(canSubmitSignature(" A ", true)).toBe(false);
    // " AB " trim → "AB" = 2 char → permette
    expect(canSubmitSignature(" AB ", true)).toBe(true);
  });
});

describe("encodeSignature — encoding base64 reversibile", () => {
  it("encode/decode roundtrip per nome ASCII", () => {
    const name = "Mario Rossi";
    const encoded = encodeSignature(name);
    expect(encoded).toMatch(/^data:text\/plain;base64,/);
    expect(decodeSignature(encoded)).toBe(name);
  });

  it("encode/decode roundtrip per caratteri italiani (àèìòù)", () => {
    const name = "Gérard Müllèr";
    const encoded = encodeSignature(name);
    expect(decodeSignature(encoded)).toBe(name);
  });

  it("encode/decode roundtrip per nome con apostrofo", () => {
    const name = "D'Amico Francesco";
    const encoded = encodeSignature(name);
    expect(decodeSignature(encoded)).toBe(name);
  });

  it("trim applicato nell'encoding", () => {
    const encoded = encodeSignature("  Mario Rossi  ");
    expect(decodeSignature(encoded)).toBe("Mario Rossi");
  });

  it("produce data URI valido", () => {
    const encoded = encodeSignature("Test");
    expect(encoded.startsWith("data:text/plain;base64,")).toBe(true);
    // La parte base64 deve essere decodificabile
    const b64 = encoded.replace("data:text/plain;base64,", "");
    expect(() => atob(b64)).not.toThrow();
  });
});
