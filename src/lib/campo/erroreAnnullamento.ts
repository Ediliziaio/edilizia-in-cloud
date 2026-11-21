/** Gli errori PostgREST sono anche oggetti semplici: conserva le regole in italiano. */
export function messaggioAnnullamento(error: unknown): string {
  const e = error && typeof error === "object" ? error as { code?: unknown; message?: unknown } : {};
  const code = typeof e.code === "string" ? e.code : "";
  const message = typeof e.message === "string" ? e.message.trim() : "";
  if (/failed to fetch|network|fetch failed|load failed/i.test(message))
    return "Connessione interrotta. Aggiorna il rapportino e riprova prima di annullarlo.";
  if (code === "PGRST301" || code === "PGRST303" || /jwt expired|invalid jwt/i.test(message))
    return "Sessione scaduta. Accedi di nuovo prima di annullare il rapportino.";
  if (/^(Non si può annullare:|Non hai il permesso di annullare|Rapportino non disponibile\.|Il rapportino è cambiato[:.]|L’avanzamento è cambiato\.|Questo rapportino è già stato annullato\.|Scrivi il motivo dell'annullamento\.|Accesso non autorizzato a questa azienda)/.test(message))
    return message;
  if (code === "PT409") return "Il rapportino è cambiato: aggiorna la pagina prima di annullarlo.";
  if (code === "42501") return "Non hai il permesso di annullare questo rapportino.";
  if (code === "55P03" || code === "57014") return "Il rapportino è occupato o la richiesta è scaduta. Aggiorna e riprova tra poco.";
  return "Annullamento non riuscito. Riprova tra poco.";
}
