/**
 * Estrae il messaggio d'errore REALE da una FunctionsHttpError di supabase-js.
 *
 * `supabase.functions.invoke(...)` ritorna `{ error }` dove `error.message` è il
 * generico "Edge Function returned a non-2xx status code". Il messaggio vero
 * restituito dall'edge function (es. `{ "error": "..." }`) è nel body della
 * risposta, accessibile via `error.context.json()`.
 *
 * Uso tipico:
 *   const { error } = await supabase.functions.invoke("x", { body });
 *   if (error) throw new Error(await edgeErrorMessage(error, "Operazione fallita"));
 */
export async function edgeErrorMessage(
  error: unknown,
  fallback = "Errore sconosciuto",
): Promise<string> {
  try {
    const body = await (error as {
      context?: { json?: () => Promise<{ error?: string; message?: string }> };
    }).context?.json?.();
    if (body?.error) return String(body.error);
    if (body?.message) return String(body.message);
  } catch {
    /* body non JSON o context assente → fallback sotto */
  }
  return error instanceof Error ? error.message : fallback;
}

/**
 * Come edgeErrorMessage, ma preferisce `detail`: le funzioni Meta Ads mettono
 * in `error` un codice (es. `ad_account_not_found`) e in `detail` la frase in
 * italiano per l'utente. Con edgeErrorMessage si vedeva il codice.
 */
export async function edgeErrorDetail(
  error: unknown,
  fallback = "Errore sconosciuto",
): Promise<string> {
  try {
    const body = await (error as {
      context?: { json?: () => Promise<{ detail?: string; error?: string; message?: string }> };
    }).context?.json?.();
    if (body?.detail) return String(body.detail);
    if (body?.error) return String(body.error);
    if (body?.message) return String(body.message);
  } catch {
    /* body non JSON o context assente → fallback sotto */
  }
  return error instanceof Error ? error.message : fallback;
}
