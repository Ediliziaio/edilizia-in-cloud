import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/headers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("Missing auth");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify user via getUser()
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error("Unauthorized");

    // Verify super_admin
    const { data: role } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "super_admin")
      .maybeSingle();
    if (!role) throw new Error("Forbidden");

    const { integration } = await req.json();

    // Read settings from key-value store
    const { data: allSettings } = await supabaseAdmin
      .from("platform_settings")
      .select("key, value");

    const settings = new Map<string, string>();
    (allSettings ?? []).forEach((s: any) => settings.set(s.key, s.value));

    let ok = false;
    let message = "";

    switch (integration) {
      case "stripe": {
        const secretKey = settings.get("stripe_secret_key") || Deno.env.get("STRIPE_SECRET_KEY") || "";
        if (!secretKey) { message = "Stripe secret key non configurata"; break; }
        try {
          const res = await fetch("https://api.stripe.com/v1/balance", {
            headers: { Authorization: `Bearer ${secretKey}` },
          });
          if (res.ok) { ok = true; message = "Stripe connesso correttamente"; }
          else {
            const body = await res.json();
            message = body?.error?.message || `HTTP ${res.status}`;
          }
        } catch (e: any) { message = e.message; }
        break;
      }

      case "google_calendar": {
        const clientId = settings.get("google_calendar_client_id") || "";
        if (!clientId) { message = "Client ID non configurato"; break; }
        ok = clientId.includes(".apps.googleusercontent.com");
        message = ok ? "Formato Client ID valido" : "Formato Client ID non valido";
        break;
      }

      case "google_maps": {
        const apiKey = settings.get("google_maps_api_key") || Deno.env.get("GOOGLE_MAPS_API_KEY") || "";
        if (!apiKey) { message = "API Key non configurata"; break; }
        try {
          const res = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?address=Roma&key=${apiKey}`
          );
          const json = await res.json();
          ok = json.status === "OK";
          message = ok ? "Google Maps API funzionante" : `Errore: ${json.status}`;
        } catch (e: any) { message = e.message; }
        break;
      }

      case "meta": {
        const appId = settings.get("meta_app_id") || "";
        if (!appId) { message = "Meta App ID non configurato"; break; }
        ok = /^\d{10,}$/.test(appId);
        message = ok ? "Formato Meta App ID valido" : "Formato App ID non valido (deve essere numerico)";
        break;
      }

      default:
        message = `Integrazione "${integration}" sconosciuta`;
    }

    return new Response(
      JSON.stringify({ ok, message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
