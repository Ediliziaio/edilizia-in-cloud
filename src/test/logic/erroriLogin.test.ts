import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { credenzialiNonValide, messaggioErroreLogin } from "@/lib/auth/erroriLogin";

describe("messaggi e tentativi di accesso", () => {
  it("conta il rifiuto delle credenziali anche con la vecchia risposta senza codice", () => {
    const moderno = new AuthApiError("Invalid login credentials", 400, "invalid_credentials");
    const precedente = new AuthApiError("Invalid login credentials", 400, undefined);
    for (const errore of [moderno, precedente]) {
      expect(credenzialiNonValide(errore)).toBe(true);
      expect(messaggioErroreLogin(errore)).toMatch(/Email o password non validi/);
    }
  });

  it.each([
    [{ code: "account_locked", message: "Accesso temporaneamente bloccato da questa rete. Il blocco scade il 23/11, 08:30." }, /23\/11, 08:30/],
    [{ code: "ip_not_allowed", message: "Accesso non consentito da questa rete." }, /rete/],
    [new AuthApiError("Email not confirmed", 400, "email_not_confirmed"), /Conferma il tuo indirizzo/],
    [new AuthApiError("User is banned", 403, "user_banned"), /sospeso/],
    [new AuthApiError("Too many requests", 429, "over_request_rate_limit"), /Troppi tentativi/],
    [new AuthRetryableFetchError("Failed to fetch", 0), /Connessione/],
    [Object.assign(new Error("Login timeout"), { __isTimeout: true }), /troppo tempo/],
    [new AuthApiError("Bad gateway", 502, "unexpected_failure"), /non ha completato/],
  ])("mostra il motivo dell’errore senza contarlo come credenziali rifiutate %#", (errore, testo) => {
    expect(credenzialiNonValide(errore)).toBe(false);
    expect(messaggioErroreLogin(errore)).toMatch(testo);
    expect(messaggioErroreLogin(errore)).not.toMatch(/Email o password non validi/);
  });
});
