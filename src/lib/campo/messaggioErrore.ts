/**
 * Il testo da mostrare quando un'operazione sul campo non riesce.
 *
 * Le frasi che il database scrive per le regole di lavoro («le ore di una persona si
 * contano una volta sola…», «Sei già qui…») arrivano come errore con codice P0001 e
 * sono già in italiano semplice: si mostrano com'è. Ogni altro errore del database
 * resta generico, perché il testo grezzo non dice niente a chi lo legge.
 */
export function messaggioErrore(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const { code, message } = error as { code?: unknown; message?: unknown };
    if (code === "P0001" && typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}
