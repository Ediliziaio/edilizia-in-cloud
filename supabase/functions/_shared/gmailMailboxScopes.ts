/** Permessi per la posta CRM: leggere messaggi/allegati e inviare risposte.
 * Non modifica i grant o i refresh token delle caselle già collegate.
 */
export const GMAIL_MAILBOX_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
] as const;

export function gmailMailboxAuthorizationUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GMAIL_MAILBOX_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    // Non accorpare deliberatamente i vecchi permessi più ampi alla nuova richiesta.
    // Questo non revoca i permessi già concessi né cambia client o credenziali.
    include_granted_scopes: "false",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/** Solo i vecchi grant che lo consentono possono cambiare etichette su Gmail. */
export function gmailCanModifyLabels(scopes: readonly string[] | null | undefined): boolean {
  return !!scopes?.some((scope) =>
    scope === "https://www.googleapis.com/auth/gmail.modify" || scope === "https://mail.google.com/"
  );
}
