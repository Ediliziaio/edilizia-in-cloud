/**
 * ⛔ DEPRECATED — NON USARE QUESTA FUNZIONE
 *
 * Questa edge function è stata deprecata e NON forwards più le richieste.
 * Causa bug P0: race condition con initiate-outbound-call, chiamate duplicate.
 *
 * ✅ USA: supabase.functions.invoke("initiate-outbound-call", { body: ... })
 *
 * Aggiornato: 2026-04-06 — da forwarder silenzioso a hard-stop esplicito.
 * Tutti i client-side call sono stati aggiornati a initiate-outbound-call.
 */

import { getCorsHeaders } from "../_shared/headers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  console.error(
    "[ai-outbound-call] DEPRECATED — questa funzione non deve più essere chiamata. " +
    "Usa initiate-outbound-call."
  );

  return new Response(
    JSON.stringify({
      error: "DEPRECATED",
      message:
        "La funzione ai-outbound-call è deprecata. " +
        "Aggiorna il codice client per usare initiate-outbound-call.",
      use_instead: "initiate-outbound-call",
    }),
    {
      status: 410, // 410 Gone — risorsa definitivamente rimossa
      headers: {
        ...getCorsHeaders(req),
        "Content-Type": "application/json",
        "X-Deprecated": "true",
        "X-Use-Instead": "initiate-outbound-call",
      },
    }
  );
});
