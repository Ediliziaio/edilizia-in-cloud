import { getCorsHeaders, jsonResponse } from "../_shared/headers.ts";

// Le versioni aperte prima del rilascio devono aggiornarsi prima di pagare.
Deno.serve((req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  return jsonResponse({ error: "Aggiorna la pagina SMS e apri la ricarica con Stripe Checkout." }, 410, cors);
});
