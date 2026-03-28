import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/headers.ts";

/** Genera firma HMAC-SHA256 per il payload del token (SEC-014) */
async function signToken(payloadB64: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadB64));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Verifica JWT: solo utenti autenticati possono generare link (SEC-014)
  try {
    await requireAuth(req, corsHeaders);
  } catch (authErr) {
    if (authErr instanceof Response) return authErr;
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { documento_id } = await req.json();
    if (!documento_id) {
      return new Response(JSON.stringify({ error: "documento_id richiesto" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Carica documento
    const { data: doc, error: fetchErr } = await supabase
      .from("documenti_fiscali")
      .select("id, numero, tipo, company_id")
      .eq("id", documento_id)
      .single();

    if (fetchErr || !doc) {
      return new Response(JSON.stringify({ error: "Documento non trovato" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (doc.tipo !== "preventivo") {
      return new Response(JSON.stringify({ error: "Solo i preventivi possono generare link di accettazione" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Crea token firmato HMAC-SHA256 (SEC-014)
    // Formato: base64(payload).hmac_hex
    const payload = {
      doc_id: documento_id,
      company_id: doc.company_id,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 giorni
    };
    const payloadB64 = btoa(JSON.stringify(payload));
    const secret = Deno.env.get("PREVENTIVO_TOKEN_SECRET") || "default-change-me";
    const sigHex = await signToken(payloadB64, secret);
    const token = `${payloadB64}.${sigHex}`;

    const publicUrl = `${req.headers.get("origin") || Deno.env.get("SITE_URL") || "https://app.ediliziaincloud.com"}/preventivo/${documento_id}?token=${encodeURIComponent(token)}`;

    return new Response(JSON.stringify({ url: publicUrl, token }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
