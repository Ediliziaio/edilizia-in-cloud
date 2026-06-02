// ============================================================================
// lead-scraper-autopilot — cron notturno che FA CRESCERE il DB proprietario
// ============================================================================
// Ogni notte prende la prossima combinazione città×settore dalla config
// lead_scraper_autopilot, la scrapa via lo scraper-worker self-host e fa
// l'upsert in scraped_companies. Avanza il cursore → copre tutto a rotazione.
// Auth: header x-cron-secret == PROACTIVE_CRON_SECRET (cron) oppure super_admin.
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const corsH = getCorsHeaders(req);

  // ── Auth: cron-secret oppure super_admin ──
  const cronSecret = Deno.env.get("PROACTIVE_CRON_SECRET") || "";
  const provided = req.headers.get("x-cron-secret") || "";
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let authed = !!cronSecret && provided === cronSecret;
  if (!authed) {
    // fallback: JWT super_admin (trigger manuale dalla UI)
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      try {
        const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
          global: { headers: { Authorization: authHeader } },
        });
        const { data: { user } } = await anon.auth.getUser();
        if (user) {
          const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
          authed = (roles || []).some((r: any) => r.role === "super_admin");
        }
      } catch { /* not authed */ }
    }
  }
  if (!authed) return errorResponse("Unauthorized", 401, corsH);

  try {
    // 1) config attiva
    const { data: cfg } = await admin.from("lead_scraper_autopilot")
      .select("*").eq("enabled", true).order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (!cfg) return jsonResponse({ skipped: "autopilot disabilitato o non configurato" }, 200, corsH);

    const cities: string[] = cfg.cities || [];
    const sectors: string[] = cfg.sectors || [];
    if (cities.length === 0 || sectors.length === 0) {
      return jsonResponse({ skipped: "città o settori vuoti" }, 200, corsH);
    }

    // 2) prossima combinazione dal cursore (rotazione su città × settori)
    const combos = cities.length * sectors.length;
    const cur = ((cfg.cursor || 0) % combos + combos) % combos;
    const city = cities[Math.floor(cur / sectors.length)];
    const sector = sectors[cur % sectors.length];

    // 3) chiama lo scraper-worker
    const url = (await getPlatformSetting("internal_scraper_url", "INTERNAL_SCRAPER_URL")).replace(/\/$/, "");
    const secret = await getPlatformSetting("internal_scraper_secret", "INTERNAL_SCRAPER_SECRET");
    if (!url) return errorResponse("internal_scraper_url non configurato.", 400, corsH);

    let scraped: any[] = [];
    let err: string | null = null;
    try {
      const res = await fetchWithTimeout(`${url}/scrape`, {
        timeoutMs: 150000,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, engine: cfg.engine || "paginegialle", keyword: sector, city, max: cfg.per_run || 40, withEmails: true }),
      });
      if (!res.ok) throw new Error(`worker ${res.status}`);
      const d = await res.json();
      scraped = d.results || [];
    } catch (e) {
      err = (e as Error).message;
    }

    // 4) upsert nel DB proprietario
    let upserted = 0;
    if (scraped.length) {
      const rows = scraped.map((b) => {
        const dk = b.place_id ? `g:${b.place_id}`
          : b.phone ? `p:${String(b.phone).replace(/[^0-9+]/g, "")}`
          : `n:${String(b.business_name || "").trim().toLowerCase()}|${String(b.city || city || "").toLowerCase()}`;
        return { ...b, region: b.region || null, dedupe_key: dk, categories: [sector.toLowerCase()] };
      });
      const { data: n } = await admin.rpc("scraped_companies_upsert", { p_rows: rows });
      upserted = typeof n === "number" ? n : rows.length;
    }

    // 5) avanza cursore + log
    const result = { city, sector, scraped: scraped.length, upserted, error: err };
    await admin.from("lead_scraper_autopilot").update({
      cursor: (cfg.cursor || 0) + 1,
      last_run_at: new Date().toISOString(),
      last_result: result,
    }).eq("id", cfg.id);

    return jsonResponse({ ok: true, ...result }, 200, corsH);
  } catch (e) {
    return errorResponse(`Autopilot error: ${(e as Error).message}`, 500, corsH);
  }
});
