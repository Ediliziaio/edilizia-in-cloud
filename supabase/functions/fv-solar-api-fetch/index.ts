/**
 * Edge Function: fv-solar-api-fetch (§9)
 *
 * Chiama Google Solar API buildingInsights con cache + quota guard.
 * Se GOOGLE_SOLAR_API_KEY non è configurata in SuperAdmin, ritorna mock
 * deterministico (dev mode) per consentire test E2E senza chiavi reali.
 *
 * Body: { lat, lng, progetto_id }
 * Output: { fonte, qualita, ore_sole_annue, superficie_tetto_mq, numero_pannelli_max, potenza_max_kwp, layout_suggerito[] }
 */

import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";

interface Payload {
  lat: number;
  lng: number;
  progetto_id?: string;
  required_quality?: "HIGH" | "MEDIUM" | "LOW";
}

const QUOTA_SOFT_LIMIT = 8000;
const QUOTA_HARD_LIMIT = 9500;

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405, corsHeaders);

  const startTime = Date.now();
  // deno-lint-ignore no-explicit-any
  let supabaseAdmin: any = null;
  let userId: string | null = null;

  try {
    const auth = await requireAuth(req, corsHeaders);
    userId = auth.userId;
    supabaseAdmin = auth.supabaseAdmin;

    const payload = (await req.json()) as Payload;
    if (
      typeof payload.lat !== "number" ||
      typeof payload.lng !== "number" ||
      payload.lat < 35 || payload.lat > 48 ||
      payload.lng < 6 || payload.lng > 19
    ) {
      return errorResponse("Coordinate fuori range Italia", 400, corsHeaders);
    }

    const apiKey = Deno.env.get("GOOGLE_SOLAR_API_KEY");
    const cacheKey = `building:${payload.lat.toFixed(5)},${payload.lng.toFixed(5)}`;

    // ── 1. Cache check ─────────────────────────────────────────────────────
    const { data: cached } = await supabaseAdmin
      .from("fv_solar_api_cache")
      .select("response, quality_level, imagery_date, expires_at")
      .eq("cache_key", cacheKey)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (cached) {
      await logUsage(supabaseAdmin, "buildingInsights", "cache");
      const result = parseSolarResponse(cached.response, cached.quality_level, cached.imagery_date, "solar_api");
      return jsonResponse(result, 200, corsHeaders);
    }

    // ── 2. Mock dev se API key non configurata ─────────────────────────────
    if (!apiKey) {
      console.log("[fv-solar-api-fetch] GOOGLE_SOLAR_API_KEY non configurata — uso mock dev");
      const mock = buildMockResponse(payload.lat, payload.lng);
      // Salvo mock in cache con TTL ridotto (1 giorno) per coerenza nelle sessioni.
      // upsert su cache_key: la riga scaduta viene rinnovata invece di violare
      // silenziosamente il vincolo UNIQUE (insert → ri-hit API ad ogni richiesta).
      await supabaseAdmin.from("fv_solar_api_cache").upsert({
        cache_key: cacheKey,
        endpoint: "buildingInsights",
        response: mock.raw,
        quality_level: "MEDIUM",
        imagery_date: mock.imagery_date,
        expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      }, { onConflict: "cache_key" });
      await logUsage(supabaseAdmin, "buildingInsights", "cache"); // mock = no API cost
      return jsonResponse(mock.result, 200, corsHeaders);
    }

    // ── 3. Quota guard ─────────────────────────────────────────────────────
    const meseAnno = new Date().toISOString().slice(0, 7);
    const { data: usageRow } = await supabaseAdmin
      .from("fv_solar_api_usage")
      .select("call_count")
      .eq("mese_anno", meseAnno)
      .eq("endpoint", "buildingInsights")
      .is("source", null)
      .maybeSingle();
    const usage = (usageRow?.call_count ?? 0) as number;

    if (usage >= QUOTA_HARD_LIMIT) {
      return errorResponse("Quota Solar API esaurita per questo mese — fallback PVGIS", 429, corsHeaders);
    }

    // ── 4. Chiamata Solar API ──────────────────────────────────────────────
    // L'API rifiuta a volte la combo requiredQuality + EXPANDED_COVERAGE con
    // 400 INVALID_ARGUMENT: proviamo prima CON l'esperimento (coverage massima),
    // poi SENZA. Default quality LOW per coprire più edifici (la qualità reale
    // viene comunque riportata nel risultato).
    const buildUrl = (withExperiments: boolean) =>
      `https://solar.googleapis.com/v1/buildingInsights:findClosest` +
      `?location.latitude=${payload.lat}` +
      `&location.longitude=${payload.lng}` +
      `&requiredQuality=${payload.required_quality ?? "LOW"}` +
      (withExperiments ? `&experiments=EXPANDED_COVERAGE` : ``) +
      `&key=${apiKey}`;

    let apiResp = await fetch(buildUrl(true), { method: "GET" });
    if (apiResp.status === 400) {
      // Combo param non accettata → retry senza EXPANDED_COVERAGE.
      apiResp = await fetch(buildUrl(false), { method: "GET" });
    }

    if (apiResp.status === 404) {
      // Edificio non trovato — salva risposta NOT_FOUND in cache TTL 30gg.
      // upsert su cache_key: rinnova la riga scaduta (vedi nota sopra).
      await supabaseAdmin.from("fv_solar_api_cache").upsert({
        cache_key: cacheKey,
        endpoint: "buildingInsights",
        response: { error: "NOT_FOUND" },
        quality_level: "NOT_FOUND",
        expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      }, { onConflict: "cache_key" });
      await logUsage(supabaseAdmin, "buildingInsights", "api");
      return jsonResponse(
        { fonte: "solar_api", qualita: "manual", error: "NOT_FOUND", message: "Edificio non trovato — usa fallback PVGIS" },
        200,
        corsHeaders
      );
    }

    if (!apiResp.ok) {
      await logUsage(supabaseAdmin, "buildingInsights", "error");
      const txt = await apiResp.text();
      // Body upstream loggato SOLO server-side: può contenere dettagli interni
      // (chiave, struttura richiesta) che non devono raggiungere il browser.
      console.error(`[fv-solar-api-fetch] Solar API ${apiResp.status}:`, txt.slice(0, 500));
      // Non blocchiamo il wizard: segnaliamo al client di usare il fallback PVGIS
      // (200 con campo `error`) invece di un 5xx che interrompe il flusso.
      return jsonResponse(
        {
          fonte: "solar_api",
          qualita: "manual",
          error: "SOLAR_API_ERROR",
          message: `Solar API ${apiResp.status} — uso PVGIS`,
        },
        200,
        corsHeaders,
      );
    }

    const json = await apiResp.json();
    // upsert su cache_key: rinnova la riga scaduta (vedi nota sopra).
    await supabaseAdmin.from("fv_solar_api_cache").upsert({
      cache_key: cacheKey,
      endpoint: "buildingInsights",
      response: json,
      quality_level: json.imageryQuality ?? "MEDIUM",
      imagery_date: parseImageryDate(json.imageryDate),
      expires_at: new Date(Date.now() + 180 * 24 * 3600 * 1000).toISOString(),
    }, { onConflict: "cache_key" });
    await logUsage(supabaseAdmin, "buildingInsights", "api");

    const result = parseSolarResponse(json, json.imageryQuality, parseImageryDate(json.imageryDate), "solar_api");
    return jsonResponse(result, 200, corsHeaders);
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[fv-solar-api-fetch] ERROR:", msg);
    return errorResponse(msg, 500, corsHeaders);
  }
});

// deno-lint-ignore no-explicit-any
async function logUsage(supabase: any, endpoint: string, source: string) {
  const meseAnno = new Date().toISOString().slice(0, 7);
  try {
    await supabase.from("fv_solar_api_usage").insert({
      endpoint,
      source,
      call_count: 1,
      cost_estimate_eur: source === "api" ? 0.005 : 0,
      mese_anno: meseAnno,
    });
  } catch { /* silent */ }
}

function parseImageryDate(d: { year?: number; month?: number; day?: number } | undefined): string | null {
  if (!d?.year) return null;
  return `${d.year}-${String(d.month ?? 1).padStart(2, "0")}-${String(d.day ?? 1).padStart(2, "0")}`;
}

// ─── Helper orientamento falde — MIRROR di src/lib/fotovoltaico/tetto.ts ─────
// (corretti per equivalenza al codice coperto da unit test; Deno-puro)
const PUNTI_CARDINALI = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
function norm360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}
function etichettaAzimut(azGradiDaNord: number): string {
  const g = Math.round(norm360(azGradiDaNord));
  return `${PUNTI_CARDINALI[Math.round(norm360(g) / 45) % 8]} ${g}°`;
}
function segmentoTettoDominante(
  segs: Array<{ area_mq: number; azimuth_deg: number; pitch_deg: number }>,
): { area_mq: number; azimuth_deg: number; pitch_deg: number } | null {
  if (!segs.length) return null;
  return segs.reduce((best, s) => (s.area_mq > best.area_mq ? s : best), segs[0]);
}

function parseSolarResponse(json: Record<string, unknown>, quality: string | null, imagery_date: string | null, fonte: string) {
  const sp = (json.solarPotential as Record<string, unknown>) ?? {};
  const numero_pannelli_max = (sp.maxArrayPanelsCount as number) ?? 0;
  const superficie = (sp.maxArrayAreaMeters2 as number) ?? 0;
  const ore_sole_annue = (sp.maxSunshineHoursPerYear as number) ?? 1500;
  // Ipotesi pannelli da 540W default
  const POTENZA_PANNELLO_W = 540;
  const potenza_max_kwp = (numero_pannelli_max * POTENZA_PANNELLO_W) / 1000;

  // Falde reali (roofSegmentStats): azimut/pendenza per segmento.
  const roofSegs = (sp.roofSegmentStats as Array<Record<string, unknown>>) ?? [];
  const segByIndex = new Map<number, { azimuth_deg: number; pitch_deg: number; area_mq: number }>();
  const segList: Array<{ area_mq: number; azimuth_deg: number; pitch_deg: number }> = [];
  roofSegs.forEach((s, i) => {
    const azimuth_deg = (s.azimuthDegrees as number) ?? 180;
    const pitch_deg = (s.pitchDegrees as number) ?? 30;
    const area_mq = ((s.stats as { areaMeters2?: number } | undefined)?.areaMeters2) ?? 0;
    segByIndex.set(i, { azimuth_deg, pitch_deg, area_mq });
    segList.push({ area_mq, azimuth_deg, pitch_deg });
  });

  // Layout suggerito: azimut/pendenza REALI per pannello (dalla sua falda).
  const configs = (sp.solarPanelConfigs as Array<Record<string, unknown>>) ?? [];
  const panels = (sp.solarPanels as Array<Record<string, unknown>>) ?? [];
  const layout_suggerito = panels.slice(0, Math.min(panels.length, 50)).map((p) => {
    const segIdx = (p.segmentIndex as number) ?? 0;
    const seg = segByIndex.get(segIdx);
    return {
      centro_lat: ((p.center as { latitude: number })?.latitude) ?? 0,
      centro_lng: ((p.center as { longitude: number })?.longitude) ?? 0,
      azimuth_deg: seg ? Math.round(seg.azimuth_deg) : 180,
      tilt_deg: seg ? Math.round(seg.pitch_deg) : 30,
      orientamento: ((p.orientation as string) ?? "LANDSCAPE") as "LANDSCAPE" | "PORTRAIT",
      produzione_annua_kwh: (p.yearlyEnergyDcKwh as number) ?? 0,
      segment_index: segIdx,
    };
  });

  const faldaDominante = segmentoTettoDominante(segList);

  const qualitaMap: Record<string, string> = {
    HIGH: "high",
    MEDIUM: "medium",
    LOW: "low",
    NOT_FOUND: "manual",
  };

  return {
    fonte,
    qualita: qualitaMap[quality ?? "MEDIUM"] ?? "medium",
    imagery_date,
    ore_sole_annue,
    superficie_tetto_disponibile_mq: superficie,
    numero_pannelli_max,
    potenza_max_kwp,
    layout_suggerito,
    azimut_dominante: faldaDominante ? etichettaAzimut(faldaDominante.azimuth_deg) : null,
    azimut_dominante_deg: faldaDominante ? Math.round(faldaDominante.azimuth_deg) : null,
    tilt_dominante_deg: faldaDominante ? Math.round(faldaDominante.pitch_deg) : null,
    configs_disponibili: configs.length,
  };
}

function buildMockResponse(lat: number, lng: number) {
  // Mock realistico per Italia: 1500-1800 ore sole annue,
  // 16-32 pannelli max, 30 m² tetto
  const seed = Math.floor((lat * 1000 + lng * 1000) % 100);
  const numero_pannelli_max = 16 + (seed % 17);
  const ore_sole = 1500 + (lat < 41 ? 250 : lat < 44 ? 150 : 50); // sud più alto
  const superficie_mq = numero_pannelli_max * 1.95;
  const potenza_max_kwp = (numero_pannelli_max * 540) / 1000;

  const layout = Array.from({ length: numero_pannelli_max }).map((_, i) => ({
    centro_lat: lat + (((i % 4) - 2) * 0.000025),
    centro_lng: lng + ((Math.floor(i / 4) - 2) * 0.000035),
    azimuth_deg: 180,
    tilt_deg: 30,
    orientamento: "LANDSCAPE" as const,
    produzione_annua_kwh: 540 * ore_sole * 0.85 / 1000, // PR 0.85
    segment_index: 0,
  }));

  const today = new Date();
  const imagery = `${today.getFullYear() - 1}-06-15`;

  return {
    raw: {
      _mock: true,
      solarPotential: {
        maxArrayPanelsCount: numero_pannelli_max,
        maxArrayAreaMeters2: superficie_mq,
        maxSunshineHoursPerYear: ore_sole,
        carbonOffsetFactorKgPerMwh: 319,
      },
      imageryQuality: "MEDIUM",
      imageryDate: { year: today.getFullYear() - 1, month: 6, day: 15 },
    },
    imagery_date: imagery,
    result: {
      fonte: "solar_api",
      qualita: "medium",
      imagery_date: imagery,
      ore_sole_annue: ore_sole,
      superficie_tetto_disponibile_mq: superficie_mq,
      numero_pannelli_max,
      potenza_max_kwp,
      layout_suggerito: layout,
      azimut_dominante: "S 180°",
      azimut_dominante_deg: 180,
      tilt_dominante_deg: 30,
      configs_disponibili: 1,
      _mock: true,
    },
  };
}
