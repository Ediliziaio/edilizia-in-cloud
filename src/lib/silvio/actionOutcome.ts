/** A missing acknowledgement is not proof that a business action failed. */
export type SilvioActionOutcome = {
  kind: "applied" | "rejected" | "review";
  message: string;
};

const uncertain = "Esito da verificare: controlla il risultato prima di ripetere l'azione. Non verrà reinviata automaticamente.";

export async function readSilvioActionOutcome(data: unknown, error?: unknown): Promise<SilvioActionOutcome> {
  if (error) {
    const context = (error as { context?: { status?: number; json?: () => Promise<unknown> } }).context;
    // Only an explicit client-side rejection is safe to report as not executed.
    if (context?.status && [400, 401, 403, 404, 410, 422].includes(context.status)) {
      let body: { error?: string; message?: string } = {};
      try { body = await context.json?.() as typeof body ?? {}; } catch { /* Keep the safe fallback. */ }
      return { kind: "rejected", message: typeof body.error === "string" ? body.error : typeof body.message === "string" ? body.message : "Richiesta non accettata. Verifica dati e permessi." };
    }
    return { kind: "review", message: uncertain };
  }
  const result = data && typeof data === "object" ? data as Record<string, unknown> : {};
  if (result.needs_review === true || result.execution_succeeded === true && result.ok !== true) {
    return { kind: "review", message: result.execution_succeeded === true
      ? "Azione eseguita, ma lo stato non è stato registrato correttamente. Verifica il risultato: non ripetere l'azione."
      : uncertain };
  }
  if (result.ok === true) return { kind: "applied", message: typeof result.message === "string" ? result.message : "Azione applicata." };
  if (result.ok === false) return { kind: "rejected", message: typeof result.message === "string" ? result.message : "Azione non applicata." };
  return { kind: "review", message: uncertain };
}
