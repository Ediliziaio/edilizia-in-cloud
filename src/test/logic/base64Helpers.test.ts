import { describe, expect, it } from "vitest";

import { base64ToUtf8, bytesToBase64, utf8ToBase64 } from "../../../supabase/functions/_shared/base64";

describe("edge base64 helpers", () => {
  it("encodes large image-like byte arrays without overflowing the call stack", () => {
    const bytes = new Uint8Array(240_000);
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = i % 251;
    }

    const encoded = bytesToBase64(bytes);
    const decoded = atob(encoded);

    expect(decoded.length).toBe(bytes.length);
    expect(decoded.charCodeAt(0)).toBe(bytes[0]);
    expect(decoded.charCodeAt(65_535)).toBe(bytes[65_535]);
    expect(decoded.charCodeAt(bytes.length - 1)).toBe(bytes[bytes.length - 1]);
  });
});

// Il metodo nativo (Uint8Array.prototype.toBase64) c'è solo nei runtime con un V8 recente:
// la funzione lo usa se lo trova e ripiega sul metodo di sempre se no. Devono dare lo stesso testo.
describe("bytesToBase64: percorso nativo e ripiego", () => {
  const proto = Uint8Array.prototype as unknown as Record<string, unknown>;
  const originale = Object.getOwnPropertyDescriptor(Uint8Array.prototype, "toBase64");

  /** Esegue `f` come se il runtime non avesse toBase64, poi rimette com'era. */
  function senzaNativo<T>(f: () => T): T {
    Object.defineProperty(Uint8Array.prototype, "toBase64", { value: undefined, configurable: true, writable: true });
    try {
      return f();
    } finally {
      if (originale) Object.defineProperty(Uint8Array.prototype, "toBase64", originale);
      else delete proto.toBase64;
    }
  }

  const campione = (n: number) => {
    const b = new Uint8Array(n);
    for (let i = 0; i < n; i++) b[i] = (i * 131 + 7) & 255;
    return b;
  };

  // Attorno ai blocchi da 0x8000 del ripiego e ai multipli di 3 del base64.
  it.each([0, 1, 2, 3, 4, 5, 0x7fff, 0x8000, 0x8001, 0x10000, 100_003, 240_000])(
    "%i byte: identico a Buffer, con e senza il metodo nativo",
    (n) => {
      const b = campione(n);
      const atteso = Buffer.from(b).toString("base64");
      expect(bytesToBase64(b)).toBe(atteso);
      expect(senzaNativo(() => bytesToBase64(b))).toBe(atteso);
    },
  );

  it("usa il metodo nativo quando c'è", () => {
    Object.defineProperty(Uint8Array.prototype, "toBase64", { value: () => "NATIVO", configurable: true, writable: true });
    try {
      expect(bytesToBase64(new Uint8Array([1, 2, 3]))).toBe("NATIVO");
    } finally {
      if (originale) Object.defineProperty(Uint8Array.prototype, "toBase64", originale);
      else delete proto.toBase64;
    }
  });

  it("una porzione di un buffer più grande si codifica da sola, senza il resto", () => {
    const grande = campione(50_000);
    const porzione = grande.subarray(1_001, 41_003);
    const atteso = Buffer.from(porzione).toString("base64");
    expect(bytesToBase64(porzione)).toBe(atteso);
    expect(senzaNativo(() => bytesToBase64(porzione))).toBe(atteso);
  });

  it("un ArrayBuffer si codifica come i suoi byte", () => {
    const b = campione(70_001);
    const buffer = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    expect(bytesToBase64(buffer)).toBe(Buffer.from(b).toString("base64"));
    expect(senzaNativo(() => bytesToBase64(buffer))).toBe(Buffer.from(b).toString("base64"));
  });

  it("testo con accenti ed emoji: andata e ritorno", () => {
    const testo = "Società Edile è più — 12,5 € 🏗️ {\"a\": 1}";
    expect(base64ToUtf8(utf8ToBase64(testo))).toBe(testo);
    expect(senzaNativo(() => base64ToUtf8(utf8ToBase64(testo)))).toBe(testo);
  });
});
