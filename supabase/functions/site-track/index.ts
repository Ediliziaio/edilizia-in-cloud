/**
 * site-track — traccia sessione e pagine viste sul sito pubblico.
 *
 * Perché una edge function e non un insert diretto dal browser: le tabelle di
 * attribuzione accettano scritture solo da service_role, così un anonimo non
 * può riempirle di righe finte. Qui la chiave resta lato server.
 *
 * Chiamata a ogni cambio pagina. La prima chiamata di una sessione porta anche
 * la provenienza (referrer, utm, gclid/fbclid): quella si scrive una volta e
 * non si tocca più, altrimenti l'ultima pagina vista sovrascriverebbe la fonte
 * vera del visitatore.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PLATFORM_ADMIN_COMPANY_ID = "00000000-0000-0000-0000-000000000001";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function pulisci(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function dispositivo(ua: string): string {
  if (/mobile|android|iphone|ipod/i.test(ua)) return "mobile";
  if (/ipad|tablet/i.test(ua)) return "tablet";
  return "desktop";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const sessionId = pulisci(body.session_id, 64);
    const path = pulisci(body.path, 500);
    if (!sessionId || !path) {
      return new Response(JSON.stringify({ error: "session_id e path obbligatori" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const visitorId = pulisci(body.visitor_id, 64) || null;
    const userAgent = req.headers.get("user-agent") ?? "";

    // Sessione: si crea alla prima pagina con la provenienza di quel momento.
    // Se esiste già la si lascia stare — la fonte è quella d'ingresso.
    const { data: esistente } = await supabase
      .from("attribution_sessions")
      .select("id, pages_viewed")
      .eq("session_id", sessionId)
      .maybeSingle();

    if (!esistente) {
      await supabase.from("attribution_sessions").insert({
        company_id: PLATFORM_ADMIN_COMPANY_ID,
        session_id: sessionId,
        visitor_id: visitorId,
        landing_page: path,
        landing_url: pulisci(body.landing_url, 1000) || null,
        referrer: pulisci(body.referrer, 1000) || null,
        utm_source: pulisci(body.utm_source, 180) || null,
        utm_medium: pulisci(body.utm_medium, 180) || null,
        utm_campaign: pulisci(body.utm_campaign, 180) || null,
        utm_content: pulisci(body.utm_content, 180) || null,
        utm_term: pulisci(body.utm_term, 180) || null,
        gclid: pulisci(body.gclid, 300) || null,
        fbclid: pulisci(body.fbclid, 300) || null,
        ttclid: pulisci(body.ttclid, 300) || null,
        msclkid: pulisci(body.msclkid, 300) || null,
        li_fat_id: pulisci(body.li_fat_id, 300) || null,
        device_type: dispositivo(userAgent),
        user_agent: userAgent.slice(0, 500),
        started_at: new Date().toISOString(),
        pages_viewed: 1,
      });
    } else {
      await supabase
        .from("attribution_sessions")
        .update({
          pages_viewed: (esistente.pages_viewed ?? 0) + 1,
          ended_at: new Date().toISOString(),
        })
        .eq("id", esistente.id);
    }

    await supabase.from("attribution_pageviews").insert({
      company_id: PLATFORM_ADMIN_COMPANY_ID,
      session_id: sessionId,
      visitor_id: visitorId,
      path,
      title: pulisci(body.title, 300) || null,
      referrer: pulisci(body.referrer, 1000) || null,
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    // Il tracciamento non deve mai disturbare la navigazione: si risponde ok
    // anche quando qualcosa va storto, e si lascia traccia nei log.
    console.error("[site-track]", e);
    return new Response(JSON.stringify({ ok: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
