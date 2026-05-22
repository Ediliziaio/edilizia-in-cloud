// supabase/functions/meta-pixel-configure/index.ts
//
// Salva/aggiorna configurazione Pixel Meta + CAPI token CIFRATO.
// Il client invia il token in plaintext, qui viene cifrato con la chiave master
// di EiC e salvato in meta_conversion_pixel.capi_token_encrypted.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encrypt, getEncryptionKey } from "../_shared/encryption.ts";
import { getCorsHeaders } from "../_shared/headers.ts";

interface ConfigRequest {
  company_id: string;
  pixel_id: string;
  pixel_name?: string;
  capi_token?: string; // plaintext
  ad_account_id?: string | null;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, corsHeaders);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401, corsHeaders);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: { user } } = await userClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) return json({ error: "unauthorized" }, 401, corsHeaders);

    let body: ConfigRequest;
    try {
      body = (await req.json()) as ConfigRequest;
    } catch {
      return json({ error: "invalid_json" }, 400, corsHeaders);
    }

    if (!body.company_id || !body.pixel_id) {
      return json({ error: "missing_required_fields" }, 400, corsHeaders);
    }

    // AUTHZ: admin only
    const [profile, roles] = await Promise.all([
      admin.from("profiles").select("company_id").eq("id", user.id).maybeSingle(),
      admin.from("user_roles").select("role").eq("user_id", user.id),
    ]);
    const r = (roles.data ?? []).map((x) => x.role);
    const isSA = r.includes("super_admin");
    const isAdmin = r.includes("company_admin");
    if (!isSA && profile.data?.company_id !== body.company_id) {
      return json({ error: "forbidden" }, 403, corsHeaders);
    }
    if (!isSA && !isAdmin) {
      return json({ error: "forbidden_requires_admin" }, 403, corsHeaders);
    }

    // Cifratura token se passato
    let tokenEncrypted: string | null = null;
    if (body.capi_token && body.capi_token.length > 10) {
      const encKey = await getEncryptionKey();
      tokenEncrypted = await encrypt(body.capi_token, encKey);
    }

    // Upsert
    try {
      const { data: existing } = await admin
        .from("meta_conversion_pixel")
        .select("id, capi_token_encrypted")
        .eq("company_id", body.company_id)
        .eq("pixel_id", body.pixel_id)
        .maybeSingle();

      if (existing) {
        const updatePayload: Record<string, unknown> = {
          pixel_name: body.pixel_name ?? null,
          ad_account_id: body.ad_account_id ?? null,
          is_active: true,
        };
        if (tokenEncrypted) updatePayload.capi_token_encrypted = tokenEncrypted;
        const { data, error } = await admin
          .from("meta_conversion_pixel")
          .update(updatePayload)
          .eq("id", existing.id)
          .select("*")
          .single();
        if (error) throw error;
        // NON ritornare il token in chiaro al client
        if (data) (data as Record<string, unknown>).capi_token_encrypted = "***";
        return json({ success: true, pixel: data }, 200, corsHeaders);
      } else {
        const { data, error } = await admin
          .from("meta_conversion_pixel")
          .insert({
            company_id: body.company_id,
            ad_account_id: body.ad_account_id ?? null,
            pixel_id: body.pixel_id,
            pixel_name: body.pixel_name ?? null,
            capi_token_encrypted: tokenEncrypted,
            is_active: true,
          })
          .select("*")
          .single();
        if (error) throw error;
        if (data) (data as Record<string, unknown>).capi_token_encrypted = "***";
        return json({ success: true, pixel: data }, 200, corsHeaders);
      }
    } catch (err) {
      const msg = String((err as Error).message ?? err);
      if (msg.includes("does not exist") || msg.includes("schema cache")) {
        return json({
          error: "schema_not_applied",
          detail: "Migration 20260522150000 (meta_conversion_pixel) non applicata.",
        }, 503, corsHeaders);
      }
      throw err;
    }
  } catch (e) {
    console.error("[meta-pixel-configure] uncaught", e);
    return json({ error: "internal_error", detail: String(e) }, 500, corsHeaders);
  }
});

function json(payload: unknown, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
