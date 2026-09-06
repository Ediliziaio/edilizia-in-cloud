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
 *
 * Riceve anche un secondo tipo di chiamata, il beacon di uscita: quando la
 * scheda viene nascosta o chiusa, il browser manda quanto tempo è rimasto su
 * quella pagina. È l'unico modo per distinguere chi legge da chi rimbalza.
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

/**
 * Chi non è una persona.
 *
 * Il caso che ha reso necessario questo filtro non era un bot esterno: era il
 * nostro. Il prerender del build visita tutte e 243 le pagine a ogni deploy, e
 * per trenta ore ha prodotto il 96% delle "visite" registrate — sette deploy,
 * 1.557 pagine finte contro 64 vere. Un sito da poche centinaia di visite
 * organiche al mese risultava avere il traffico di un portale.
 *
 * Il controllo sta qui e non solo nel client perché un browser aperto su una
 * versione vecchia del bundle continuerebbe a mandare quello che vuole.
 */
const NON_UMANI =
  /bot|crawl|spider|slurp|headless|puppeteer|playwright|lighthouse|prerender|phantom|selenium|scrapy|python-requests|curl\/|wget|axios|node-fetch|go-http|java\/|okhttp|facebookexternalhit|bingpreview|semrush|ahrefs|dataforseo|screaming|petalbot|yandex|gptbot|claudebot|ccbot/i;

function nonUmano(ua: string): boolean {
  // Nessun user agent: nessun browser vero omette questo header.
  if (!ua.trim()) return true;
  return NON_UMANI.test(ua);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const userAgentGrezzo = req.headers.get("user-agent") ?? "";
    if (nonUmano(userAgentGrezzo)) {
      // Si risponde ok: a un crawler non serve sapere di essere stato escluso,
      // e un errore lo farebbe solo riprovare.
      return new Response(JSON.stringify({ ok: true, ignorato: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Beacon di uscita: porta solo quanto tempo è durata una vista già
    // registrata. Aggiorna la riga indicata dal client e nessun'altra, e solo
    // se il tempo non è già stato scritto: così un beacon ripetuto — succede,
    // fra visibilitychange e pagehide — non raddoppia niente.
    const clientIdUscita = pulisci(body.client_id, 64);
    const durata = Number(body.durata_ms);
    if (body.tipo === "uscita" && clientIdUscita && Number.isFinite(durata) && durata > 0) {
      const db = createClient(supabaseUrl, serviceKey);
      await db
        .from("attribution_pageviews")
        .update({ durata_ms: Math.min(Math.round(durata), 6 * 60 * 60 * 1000) })
        .eq("client_id", clientIdUscita)
        .is("durata_ms", null);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sessionId = pulisci(body.session_id, 64);
    const path = pulisci(body.path, 500);
    if (!sessionId || !path) {
      return new Response(JSON.stringify({ error: "session_id e path obbligatori" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const visitorId = pulisci(body.visitor_id, 64) || null;
    const userAgent = userAgentGrezzo;

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
      client_id: pulisci(body.client_id, 64) || null,
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
