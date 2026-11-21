import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";
import { configurazioneMapsBrowser } from "../_shared/mapsBrowserConfig.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });

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

    // Configurazione browser: Static satellite non è disponibile per gli account SEE.
    if (integration === "google_maps") {
      const configurazione = await configurazioneMapsBrowser(getPlatformSetting);
      const esito = {
        ok: configurazione.configured,
        verifica: "configurazione",
        message: configurazione.configured
          ? "Chiave della mappa interattiva configurata. Verifica immagini e domini aprendo il tetto nel configuratore."
          : configurazione.message,
      };
      return new Response(JSON.stringify(esito), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    let ok = false;
    let message = "";
    let verifica: "connessione" | "formato" | undefined;

    switch (integration) {
      case "stripe": {
        verifica = "connessione";
        const secretKey = await getPlatformSetting("stripe_secret_key", "STRIPE_SECRET_KEY");
        if (!secretKey) { message = "Stripe secret key non configurata"; break; }
        try {
          const res = await fetch("https://api.stripe.com/v1/balance", {
            headers: { Authorization: `Bearer ${secretKey}` },
            signal: AbortSignal.timeout(8000),
          });
          ok = res.ok;
          message = ok ? "Stripe connesso correttamente" : `Stripe ha rifiutato la verifica (HTTP ${res.status}).`;
        } catch {
          message = "Stripe non raggiungibile. Riprova tra poco.";
        }
        break;
      }

      case "google_calendar": {
        verifica = "formato";
        const clientId = (await getPlatformSetting("google_calendar_client_id", "GOOGLE_CALENDAR_CLIENT_ID")).trim();
        if (!clientId) { message = "Client ID non configurato"; break; }
        ok = /^[\w-]+\.apps\.googleusercontent\.com$/.test(clientId);
        message = ok ? "Formato Client ID valido" : "Formato Client ID non valido";
        break;
      }

      case "meta": {
        verifica = "formato";
        const appId = (await getPlatformSetting("meta_app_id", "META_APP_ID")).trim();
        if (!appId) { message = "Meta App ID non configurato"; break; }
        ok = /^\d{10,}$/.test(appId);
        message = ok ? "Formato Meta App ID valido" : "Formato App ID non valido (deve essere numerico)";
        break;
      }

      default:
        message = `Integrazione "${integration}" sconosciuta`;
    }

    return new Response(
      JSON.stringify({ ok, message, verifica }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Verifica non riuscita" }),
      { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
