/** Nessun dettaglio/token restituito dal server finisce nel messaggio UI. */
export async function erroreImpersonazione(error: unknown): Promise<string> {
  const context = error && typeof error === "object" && "context" in error ? error.context : null;
  if (context instanceof Response) {
    if (context.status === 429) {
      let seconds = 10;
      try {
        const body = await context.clone().json();
        const value = Number(body.retry_after_seconds);
        if (Number.isFinite(value) && value > 0) seconds = Math.min(10, Math.ceil(value));
      } catch { /* La risposta può essere vuota: resta un'attesa breve. */ }
      return `Hai richiesto più accessi ravvicinati. Riprova tra ${seconds} secondi: resti in questa pagina.`;
    }
    if (context.status === 401) return "Sessione da verificare. Aggiorna la pagina e riprova: non sei entrato nell’azienda.";
    if (context.status === 403) return "Non sei autorizzato ad accedere a questa azienda.";
  }
  return "Accesso aziendale non riuscito. Riprova: resti in questa pagina, senza cambiare azienda.";
}
