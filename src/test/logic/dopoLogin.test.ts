/**
 * Il ritorno dopo l'accesso (QR degli attrezzi, 05/10/2026): solo percorsi
 * interni, una volta sola, per dieci minuti.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { leggiDopoLogin, ricordaDopoLogin } from "@/lib/auth/dopoLogin";

afterEach(() => {
  vi.useRealTimers();
  sessionStorage.clear();
});

describe("ritorno dopo l'accesso", () => {
  it("riporta al QR dell'attrezzo, una volta sola", () => {
    ricordaDopoLogin("/q/ATT-0012?c=abc");
    expect(leggiDopoLogin()).toBe("/q/ATT-0012?c=abc");
    expect(leggiDopoLogin()).toBeNull();
  });

  it("non porta fuori dall'app", () => {
    ricordaDopoLogin("https://sito-esterno.example/q/ATT-1");
    expect(leggiDopoLogin()).toBeNull();
    ricordaDopoLogin("//sito-esterno.example/q/ATT-1");
    expect(leggiDopoLogin()).toBeNull();
  });

  it("un valore scritto a mano per portare fuori non vale", () => {
    sessionStorage.setItem("eic_dopo_login", JSON.stringify({ percorso: "//evil.example", scade: Date.now() + 60_000 }));
    expect(leggiDopoLogin()).toBeNull();
  });

  it("dopo dieci minuti non vale più", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-05T10:00:00Z"));
    ricordaDopoLogin("/q/ATT-0012");
    vi.setSystemTime(new Date("2026-10-05T10:11:00Z"));
    expect(leggiDopoLogin()).toBeNull();
  });
});
