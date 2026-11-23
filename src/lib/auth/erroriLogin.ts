type ErroreLogin = {
  code?: string;
  name?: string;
  message?: string;
  status?: number;
  __isTimeout?: boolean;
};

export function credenzialiNonValide(errore: ErroreLogin): boolean {
  return errore.code === "invalid_credentials"
    || (!errore.code && errore.name === "AuthApiError" && errore.message?.trim().toLowerCase() === "invalid login credentials");
}

export function messaggioErroreLogin(errore: ErroreLogin): string {
  if (errore.code === "account_locked" || errore.code === "ip_not_allowed") {
    return errore.message || "Accesso bloccato. Contatta un amministratore della tua azienda.";
  }
  if (errore.code === "email_not_confirmed") {
    return "Conferma il tuo indirizzo email prima di accedere.";
  }
  if (errore.code === "user_banned") {
    return "L’accesso a questo account è sospeso. Contatta l’amministratore.";
  }
  if (errore.code === "email_provider_disabled") {
    return "L’accesso con email e password non è disponibile. Usa il metodo previsto per il tuo account.";
  }
  if (errore.status === 429 || errore.code === "over_request_rate_limit") {
    return "Troppi tentativi in poco tempo. Attendi qualche minuto prima di riprovare.";
  }
  if (credenzialiNonValide(errore)) {
    return "Email o password non validi. Se usi Google per questo account, scegli «Accedi con Google».";
  }
  if (errore.__isTimeout || errore.name === "TimeoutError" || /timeout|timed out/i.test(errore.message ?? "")) {
    return "Il servizio di accesso ha impiegato troppo tempo a rispondere. Riprova tra poco.";
  }
  if (errore.name === "AuthRetryableFetchError" || errore.name === "AbortError" || errore.status === 0) {
    return "Connessione al servizio di accesso interrotta. Controlla la connessione e riprova.";
  }
  return "Il servizio di accesso non ha completato la richiesta. Riprova tra poco.";
}
