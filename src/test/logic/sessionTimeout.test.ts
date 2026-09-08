import { describe, expect, it } from "vitest";
import type { Session } from "@supabase/supabase-js";
import { clearSessionStarted, isSessionExpired, markSessionStarted } from "@/hooks/useSessionTimeout";

const GIORNO = 24 * 60 * 60 * 1000;

function sessione(ultimoAccessoMs: number | null): Session {
  return {
    user: ultimoAccessoMs === null
      ? {}
      : { last_sign_in_at: new Date(ultimoAccessoMs).toISOString() },
  } as unknown as Session;
}

describe("useSessionTimeout — scadenza dei 45 giorni", () => {
  it("non slogga chi non ha una sessione", () => {
    expect(isSessionExpired(null)).toBe(false);
  });

  // Il caso dell'8 settembre 2026: pratiche@greenenergygroup.it aveva fatto
  // l'accesso la mattina stessa e alle 11:20, cambiando azienda, è stata
  // buttata fuori. Il marker locale era fermo al suo primo accesso in assoluto.
  it("chi ha fatto l'accesso oggi resta dentro anche con un marker vecchio", () => {
    clearSessionStarted();
    markSessionStarted();
    try {
      localStorage.setItem("eic_session_started_at", String(Date.now() - 60 * GIORNO));
    } catch { /* ambiente senza localStorage: il test vale lo stesso */ }
    expect(isSessionExpired(sessione(Date.now() - 3 * 60 * 60 * 1000))).toBe(false);
    clearSessionStarted();
  });

  it("slogga chi non accede da più di 45 giorni", () => {
    clearSessionStarted();
    expect(isSessionExpired(sessione(Date.now() - 46 * GIORNO))).toBe(true);
  });

  it("tiene dentro chi ha 44 giorni", () => {
    clearSessionStarted();
    expect(isSessionExpired(sessione(Date.now() - 44 * GIORNO))).toBe(false);
  });

  it("senza last_sign_in_at ricade sul marker locale", () => {
    clearSessionStarted();
    expect(isSessionExpired(sessione(null))).toBe(false); // nessun riferimento → non scaduta
    try {
      localStorage.setItem("eic_session_started_at", String(Date.now() - 46 * GIORNO));
      expect(isSessionExpired(sessione(null))).toBe(true);
    } finally {
      clearSessionStarted();
    }
  });
});
