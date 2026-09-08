/**
 * Gli errori di auth.admin.createUser / inviteUserByEmail arrivano in inglese
 * ("A user with this email address has already been registered", "Password
 * should be at least 6 characters", "Unable to validate email address: invalid
 * format") e cinque edge function li rimandavano a schermo cosi' com'erano
 * (audit crea/cancella del 7 settembre 2026). Qui il vocabolario di GoTrue
 * diventa una frase che dice cosa fare; quello che non riconosciamo passa
 * intatto, mai peggio di prima.
 */
export function messaggioErroreAuth(
  error: { message?: string; code?: string } | null | undefined,
  fallback = "Errore nella creazione dell'utente. Riprova.",
): string {
  const msg = (error?.message ?? "").toLowerCase();
  const code = (error?.code ?? "").toLowerCase();
  if (!msg && !code) return fallback;
  if (
    code === "email_exists" ||
    msg.includes("already been registered") ||
    msg.includes("already registered") ||
    msg.includes("already exists")
  ) {
    return "Esiste già un utente con questo indirizzo email. Usa un'email diversa.";
  }
  if (msg.includes("password") && (msg.includes("at least") || msg.includes("weak") || msg.includes("short"))) {
    return "La password è troppo corta o troppo debole: servono almeno 6 caratteri.";
  }
  if (msg.includes("invalid format") || msg.includes("validate email") || msg.includes("invalid email")) {
    return "L'indirizzo email non è valido. Controllalo e riprova.";
  }
  if (msg.includes("rate limit")) return "Troppe email inviate in poco tempo. Riprova tra qualche minuto.";
  if (msg.includes("error sending")) return "Non sono riuscito a inviare l'email. Riprova tra poco.";
  if (msg.includes("database error")) return "Errore temporaneo nella creazione dell'utente. Riprova tra qualche istante.";
  if (msg.includes("signups not allowed")) return "Le registrazioni sono disattivate su questa piattaforma.";
  return error?.message || fallback;
}
