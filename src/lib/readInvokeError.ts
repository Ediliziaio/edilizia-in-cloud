// Messaggio d'errore VERO di una edge function invocata con supabase.functions.invoke:
// error.message di FunctionsHttpError e' il generico "Edge Function returned a
// non-2xx status code", il motivo (cap raggiunto, numero non su WhatsApp...) sta
// nel body della risposta.

export async function readInvokeError(error: unknown): Promise<string> {
  try {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      const body = await ctx.json();
      if (body?.error) return body.error;
    }
  } catch { /* ignore */ }
  return (error as Error)?.message ?? "Errore imprevisto";
}

// Come readInvokeError, ma aggiunge il motivo tecnico («details») quando la
// funzione lo manda: whatsapp-connect ci mette l'errore di Meta, che è quello
// che serve a capire perché un collegamento è stato rifiutato.
export async function readInvokeErrorConDettagli(error: unknown): Promise<string> {
  try {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      const body = await ctx.json();
      if (body?.error) return body.details ? `${body.error} — ${body.details}` : body.error;
    }
  } catch { /* ignore */ }
  return (error as Error)?.message ?? "Errore imprevisto";
}
