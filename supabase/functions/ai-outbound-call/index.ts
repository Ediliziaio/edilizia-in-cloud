// DEPRECATED: This function has been replaced by initiate-outbound-call
// All requests are forwarded to the new endpoint.

import { getCorsHeaders } from "../_shared/headers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const newEndpoint = `${supabaseUrl}/functions/v1/initiate-outbound-call`;

  // Forward the request body and auth headers to the new function
  const body = await req.text();
  const forwarded = await fetch(newEndpoint, {
    method: req.method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": req.headers.get("Authorization") ?? "",
    },
    body: body || undefined,
  });

  const responseBody = await forwarded.text();
  return new Response(responseBody, {
    status: forwarded.status,
    headers: {
      ...getCorsHeaders(req),
      "Content-Type": forwarded.headers.get("Content-Type") ?? "application/json",
      "X-Deprecated": "Use initiate-outbound-call instead",
    },
  });
});
