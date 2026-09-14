/**
 * Edge Function: sr-firma-cliente
 *
 * Endpoint PUBBLICO per firma digitale del cliente dal microsito.
 * Riceve token + immagine firma (data URL PNG base64), salva nello storage
 * e aggiorna sr_progetti.firma_cliente_url + firmato_il + stato='accettato'.
 *
 * Body: { token: string, signature_data_url: string, signer_name?: string }
 * Output: { ok, firmato_il, stato }
 */
import { jsonResponse, errorResponse } from "../_shared/headers.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PUBLIC_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  // Le intestazioni che manda supabase.functions.invoke (come in _shared/headers.ts):
  // col solo Content-Type il browser bloccava la richiesta, e il link del
  // cliente non si apriva mai né si poteva firmare.
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Payload {
  token: string;
  signature_data_url: string;
  signer_name?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: PUBLIC_CORS_HEADERS });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405, PUBLIC_CORS_HEADERS);

  try {
    const p = (await req.json()) as Payload;
    if (!p.token) return errorResponse("Token mancante", 400, PUBLIC_CORS_HEADERS);
    if (!p.signature_data_url?.startsWith("data:image/")) {
      return errorResponse("Firma non valida", 400, PUBLIC_CORS_HEADERS);
    }
    // Limite dimensione (~500KB base64 = ~375KB binary)
    if (p.signature_data_url.length > 700_000) {
      return errorResponse("Firma troppo grande", 400, PUBLIC_CORS_HEADERS);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1. Verifica progetto
    const { data: prog, error: progErr } = await sb
      .from("sr_progetti")
      .select("id, company_id, stato, allow_self_signing, firmato_il, public_token")
      .eq("public_token", p.token)
      .maybeSingle();
    if (progErr || !prog) return errorResponse("Stima non trovata", 404, PUBLIC_CORS_HEADERS);
    if (!prog.allow_self_signing) {
      return errorResponse("Firma digitale non abilitata per questo preventivo", 403, PUBLIC_CORS_HEADERS);
    }
    if (prog.firmato_il) {
      return errorResponse("Stima già firmata", 409, PUBLIC_CORS_HEADERS);
    }
    if (!["da_consegnare", "consegnato", "in_valutazione"].includes(prog.stato)) {
      return errorResponse("Stato non firmabile", 403, PUBLIC_CORS_HEADERS);
    }

    // 2. Decode base64 → binary
    const match = p.signature_data_url.match(/^data:image\/(png|jpeg);base64,(.+)$/);
    if (!match) return errorResponse("Formato firma non supportato", 400, PUBLIC_CORS_HEADERS);
    const ext = match[1] === "jpeg" ? "jpg" : "png";
    const b64 = match[2];
    const binary = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

    // 3. Upload signature
    const storagePath = `${prog.company_id}/${prog.id}/signature.${ext}`;
    const { error: upErr } = await sb.storage
      .from("sr-progetti")
      .upload(storagePath, binary, {
        contentType: `image/${ext}`,
        upsert: true,
        cacheControl: "no-cache",
      });
    if (upErr) throw new Error(`Upload firma fallito: ${upErr.message}`);

    const { data: signed } = await sb.storage
      .from("sr-progetti")
      .createSignedUrl(storagePath, 60 * 60 * 24 * 365);
    const firmaUrl = signed?.signedUrl ?? "";

    // 4. Update progetto
    const now = new Date().toISOString();
    await sb.from("sr_progetti").update({
      firma_cliente_url: firmaUrl,
      firmato_il: now,
      stato: "accettato",
    }).eq("id", prog.id);

    // 5. Audit
    await sb.from("sr_progetti_audit").insert({
      progetto_id: prog.id,
      company_id: prog.company_id,
      event_type: "signed_by_client",
      event_data: {
        signer_name: p.signer_name ?? null,
        signed_at: now,
        via: "public_microsite",
      },
    });

    return jsonResponse({
      ok: true,
      firmato_il: now,
      stato: "accettato",
    }, 200, PUBLIC_CORS_HEADERS);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sr-firma-cliente] error", msg);
    return errorResponse(msg, 500, PUBLIC_CORS_HEADERS);
  }
});
