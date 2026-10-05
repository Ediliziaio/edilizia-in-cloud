/**
 * Edge Function: sr-firma-cliente — CHIUSA.
 *
 * Era la firma «col solo disegno» del microsito /stima: niente codice di
 * verifica, niente richiesta di firma, nessuna traccia oltre a un PNG. Il
 * preventivo Serramenti si firma ora come gli altri: dal link di firma
 * (/firma-fea/…) col codice a 6 cifre mandato via email.
 *
 * La funzione resta, senza JWT come in config.toml, solo per rispondere 410 a
 * chi avesse ancora il vecchio client aperto.
 */
import { errorResponse } from "../_shared/headers.ts";

const PUBLIC_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: PUBLIC_CORS_HEADERS });
  return errorResponse(
    "La firma si fa con il codice ricevuto via email: apri il link di firma che ti ha mandato l'azienda.",
    410,
    PUBLIC_CORS_HEADERS,
  );
});
