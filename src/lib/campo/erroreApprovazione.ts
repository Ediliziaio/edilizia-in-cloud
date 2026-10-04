/**
 * Il testo da mostrare quando un'approvazione di rapportino non va a buon fine.
 *
 * Le frasi scritte dal database per le regole di lavoro («le ore di una persona si
 * contano una volta sola…») arrivano come errore con codice P0001 e sono già in
 * italiano semplice: si mostrano com'è. Ogni altro errore del database resta
 * generico, perché il testo grezzo non dice niente a chi approva.
 */
export function messaggioApprovazione(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const { code, message } = error as { code?: unknown; message?: unknown };
    if (code === "P0001" && typeof message === "string" && message.trim()) return message;
  }
  return "Errore durante l'approvazione";
}
