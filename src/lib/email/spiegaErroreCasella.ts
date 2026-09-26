/**
 * L'errore di una casella email, detto in parole semplici (25/09/2026).
 *
 * Le caselle salvano l'errore così come lo restituisce Google, Microsoft o il
 * server di posta: «token_refresh_failed: 400 { "error": "invalid_grant" … }».
 * Mostrato così spaventa (un cliente ha pensato che Gmail non funzionasse) e
 * non dice cosa fare. Qui ogni errore diventa una frase che dice cosa è
 * successo e cosa premere. Il testo originale resta nel database e, dove
 * serve, in un tooltip.
 */

/** Chi ha dato l'accesso alla casella: si nomina nella frase. */
function chiDaAccesso(provider?: string | null, errore = ""): string {
  const p = `${provider ?? ""} ${errore}`.toLowerCase();
  if (p.includes("outlook") || p.includes("microsoft") || p.includes("office") || p.includes("azure")) return "Microsoft";
  if (p.includes("gmail") || p.includes("google")) return "Google";
  return "";
}

export function spiegaErroreCasella(errore: string | null | undefined, provider?: string | null): string {
  const e = String(errore ?? "").toLowerCase();
  if (!e.trim()) return "";
  const chi = chiDaAccesso(provider, e);

  // Accesso scaduto o tolto: il caso più comune (password cambiata, permesso revocato, 6 mesi senza uso).
  if (/invalid_grant|expired or revoked|refresh_token_missing|token_refresh_failed|tokens?_not_found|unauthorized_client|revoked/.test(e)) {
    return chi
      ? `${chi} ha chiuso l'accesso a questa casella: succede quando cambi la password o togli il permesso. Premi «Riconnetti» e conferma: ci vuole un minuto.`
      : "Il collegamento di questa casella si è interrotto. Premi «Riconnetti» e conferma l'accesso: ci vuole un minuto.";
  }
  // Password della casella (Aruba, Libero, iCloud…) non più valida.
  if (/authenticationfailed|authentication failed|invalid credentials|login failed|auth(entication)? (error|failed)|535|password/.test(e)) {
    return "La password della casella non funziona più (forse è stata cambiata). Premi «Riconnetti» e inseriscila di nuovo.";
  }
  // Troppe richieste: si aspetta, non serve fare niente.
  if (/\b429\b|rate.?limit|quota|too many/.test(e)) {
    return `${chi || "Il servizio di posta"} sta rallentando le richieste: riproviamo da soli tra qualche minuto, non devi fare niente.`;
  }
  // Rete, server lento o irraggiungibile.
  if (/timeout|timed out|econn|enotfound|network|socket|503|502|504|unavailable/.test(e)) {
    return "Il server della casella non ha risposto. Riproviamo da soli; se continua per ore, premi «Riconnetti».";
  }
  return "Questa casella non si aggiorna più. Premi «Riconnetti» per sistemarla; se non basta, scrivici e controlliamo noi.";
}
