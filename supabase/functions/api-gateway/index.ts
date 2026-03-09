import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, secureHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  try {
    const body = await req.json();
    const { action, ...params } = body;

    // Auth check
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (authError || !user) return errorResponse("Non autorizzato", 401);

    // Get user profile for company_id
    const { data: profile } = await admin
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .single();

    if (!profile?.company_id) return errorResponse("Profilo non trovato", 403);
    const companyId = profile.company_id;

    switch (action) {
      case "generate_key": {
        const { name, scopes, rate_limit_per_minute, rate_limit_per_day, expires_at } = params;

        // Generate a random API key
        const rawKey = `eic_${crypto.randomUUID().replace(/-/g, "")}`;
        const keyPrefix = rawKey.substring(0, 12);

        // Hash the key for storage
        const encoder = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(rawKey));
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const keyHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

        const { data, error } = await admin.from("api_keys").insert({
          company_id: companyId,
          name: name || "Default",
          key_hash: keyHash,
          key_prefix: keyPrefix,
          scopes: scopes || ["read"],
          rate_limit_per_minute: rate_limit_per_minute || 60,
          rate_limit_per_day: rate_limit_per_day || 10000,
          is_active: true,
          expires_at: expires_at || null,
          created_by: user.id,
        }).select().single();

        if (error) throw error;

        return jsonResponse({ ...data, raw_key: rawKey });
      }

      case "list_keys": {
        const { data, error } = await admin
          .from("api_keys")
          .select("id, name, key_prefix, scopes, rate_limit_per_minute, rate_limit_per_day, is_active, last_used_at, expires_at, created_at")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false });

        if (error) throw error;
        return jsonResponse(data);
      }

      case "revoke_key": {
        const { key_id } = params;
        const { error } = await admin
          .from("api_keys")
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq("id", key_id)
          .eq("company_id", companyId);

        if (error) throw error;
        return jsonResponse({ success: true });
      }

      case "update_key": {
        const { key_id, name, scopes, rate_limit_per_minute, rate_limit_per_day, is_active } = params;
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (name !== undefined) updates.name = name;
        if (scopes !== undefined) updates.scopes = scopes;
        if (rate_limit_per_minute !== undefined) updates.rate_limit_per_minute = rate_limit_per_minute;
        if (rate_limit_per_day !== undefined) updates.rate_limit_per_day = rate_limit_per_day;
        if (is_active !== undefined) updates.is_active = is_active;

        const { data, error } = await admin
          .from("api_keys")
          .update(updates)
          .eq("id", key_id)
          .eq("company_id", companyId)
          .select()
          .single();

        if (error) throw error;
        return jsonResponse(data);
      }

      case "get_usage_stats": {
        const { key_id, days = 30 } = params;
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - days);

        let query = admin
          .from("api_usage_daily")
          .select("*")
          .eq("company_id", companyId)
          .gte("date", fromDate.toISOString().split("T")[0])
          .order("date", { ascending: true });

        if (key_id) query = query.eq("api_key_id", key_id);

        const { data, error } = await query;
        if (error) throw error;

        // Aggregate
        const totals = (data || []).reduce(
          (acc, d) => ({
            total: acc.total + (d.total_requests || 0),
            success: acc.success + (d.successful_requests || 0),
            failed: acc.failed + (d.failed_requests || 0),
          }),
          { total: 0, success: 0, failed: 0 }
        );

        return jsonResponse({ daily: data, totals });
      }

      case "validate_api_key": {
        // This is for external API calls - validate by raw key
        const { api_key } = params;
        if (!api_key) return errorResponse("API key richiesta", 400);

        const encoder = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(api_key));
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const keyHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

        const { data: keyData } = await admin
          .from("api_keys")
          .select("*")
          .eq("key_hash", keyHash)
          .eq("is_active", true)
          .maybeSingle();

        if (!keyData) return errorResponse("API key non valida", 401);

        // Check expiry
        if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
          return errorResponse("API key scaduta", 401);
        }

        // Update last_used_at
        await admin
          .from("api_keys")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", keyData.id);

        return jsonResponse({
          valid: true,
          company_id: keyData.company_id,
          scopes: keyData.scopes,
          rate_limit_per_minute: keyData.rate_limit_per_minute,
        });
      }

      default:
        return errorResponse("Azione non supportata", 400);
    }
  } catch (e) {
    console.error("api-gateway error:", e);
    return errorResponse(e.message || "Errore interno", 500);
  }
});
