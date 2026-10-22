export interface ErroreFirma { error?: string; code?: string }

/** Il corpo dell'errore di una funzione server ({ error, code }), se leggibile. */
export async function corpoErroreEdge(error: unknown): Promise<ErroreFirma> {
  try {
    const ctx = (error as { context?: { json?: () => Promise<unknown> } })?.context;
    if (ctx?.json) return ((await ctx.json()) as ErroreFirma | null) ?? {};
  } catch {
    // corpo non leggibile
  }
  return {};
}
