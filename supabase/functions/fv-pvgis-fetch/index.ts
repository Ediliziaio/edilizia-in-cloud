/**
 * Edge Function: fv-pvgis-fetch (§10)
 *
 * Fallback gratuito a Google Solar API.
 * Chiama PVGIS JRC con cache 365 giorni.
 *
 * Body: { lat, lng, kwp, tilt?, azimuth_solar?, loss_pct? }
 * Output: { fonte: 'pvgis', produzione_annua_kwh, produzione_mensile[], elevation, raddatabase }
 *
 * Conversione azimut: PVGIS aspect 0=S, -90=E, +90=O (range -180..+180).
 * Solar API/Maps 0=N, 90=E, 180=S, 270=O.
 *   pvgis_azimuth = solar_api_azimuth - 180
 */

import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";

interface Payload {
  lat: number;
  lng: number;
  kwp: number;
  tilt?: number;       // default 30°
  azimuth_solar?: number; // default 180 (sud) — formato Solar API
  loss_pct?: number;   // default 14 (perdite di sistema PVGIS)
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405, corsHeaders);

  // deno-lint-ignore no-explicit-any
  let supabaseAdmin: any = null;

  try {
    const auth = await requireAuth(req, corsHeaders);
    supabaseAdmin = auth.supabaseAdmin;

    const p = (await req.json()) as Payload;
    if (
      typeof p.lat !== "number" || typeof p.lng !== "number" ||
      p.lat < 35 || p.lat > 48 || p.lng < 6 || p.lng > 19
    ) {
      return errorResponse("Coordinate fuori range Italia", 400, corsHeaders);
    }
    if (typeof p.kwp !== "number" || p.kwp <= 0) {
      return errorResponse("kwp deve essere > 0", 400, corsHeaders);
    }

    const tilt = p.tilt ?? 30;
    const azimuthSolar = p.azimuth_solar ?? 180;
    const loss = p.loss_pct ?? 14;
    // Conversione: PVGIS aspect: 0 = sud, -90 = est, +90 = ovest
    const pvgisAzimuth = azimuthSolar - 180;

    const cacheKey = `pvgis:${p.lat.toFixed(5)},${p.lng.toFixed(5)}:tilt${tilt}:az${pvgisAzimuth}:p${p.kwp}`;

    // Cache check
    const { data: cached } = await supabaseAdmin
      .from("fv_pvgis_cache")
      .select("response, expires_at")
      .eq("cache_key", cacheKey)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (cached) {
      return jsonResponse(cached.response, 200, corsHeaders);
    }

    // Mock dev se necessario (fallback se API down) — useremo se DENO_ENV=mock
    const useMock = Deno.env.get("FV_USE_MOCK_PVGIS") === "true";
    if (useMock) {
      const mock = buildMockPvgis(p.lat, p.lng, p.kwp, tilt, azimuthSolar);
      // upsert su cache_key (UNIQUE): rinnova la riga scaduta invece di violare
      // silenziosamente il vincolo con insert → ri-hit PVGIS ad ogni richiesta.
      await supabaseAdmin.from("fv_pvgis_cache").upsert({
        cache_key: cacheKey,
        response: mock,
        expires_at: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
      }, { onConflict: "cache_key" });
      return jsonResponse(mock, 200, corsHeaders);
    }

    // Chiamata PVGIS
    const url =
      `https://re.jrc.ec.europa.eu/api/v5_2/PVcalc` +
      `?lat=${p.lat}&lon=${p.lng}` +
      `&peakpower=${p.kwp}&loss=${loss}&angle=${tilt}&aspect=${pvgisAzimuth}` +
      `&outputformat=json&raddatabase=PVGIS-SARAH2`;

    let resp: Response;
    try {
      resp = await fetch(url);
    } catch {
      // PVGIS down — usa mock
      const mock = buildMockPvgis(p.lat, p.lng, p.kwp, tilt, azimuthSolar);
      mock._fallback = "PVGIS unreachable";
      return jsonResponse(mock, 200, corsHeaders);
    }

    if (!resp.ok) {
      const txt = await resp.text();
      // Body upstream loggato SOLO server-side (non al browser). Coerente col
      // ramo catch: non blocchiamo il wizard con un 502, ripieghiamo sul mock
      // (200) così il flusso prosegue come per "PVGIS unreachable".
      console.error(`[fv-pvgis-fetch] PVGIS ${resp.status}:`, txt.slice(0, 500));
      const mock = buildMockPvgis(p.lat, p.lng, p.kwp, tilt, azimuthSolar);
      mock._fallback = `PVGIS ${resp.status}`;
      return jsonResponse(mock, 200, corsHeaders);
    }

    const json = await resp.json();
    const result = parsePvgis(json, p.kwp);

    // upsert su cache_key (UNIQUE): rinnova la riga scaduta (vedi nota sopra).
    await supabaseAdmin.from("fv_pvgis_cache").upsert({
      cache_key: cacheKey,
      response: result,
      expires_at: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
    }, { onConflict: "cache_key" });

    return jsonResponse(result, 200, corsHeaders);
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : String(err);
    // Dettaglio interno loggato SOLO server-side: al client un messaggio generico.
    console.error("[fv-pvgis-fetch] ERROR:", msg);
    return errorResponse("Errore interno", 500, corsHeaders);
  }
});

function parsePvgis(json: Record<string, unknown>, kwp: number) {
  const outputs = (json.outputs as Record<string, unknown>) ?? {};
  const totals = (outputs.totals as Record<string, unknown>) ?? {};
  const fixed = (totals.fixed as Record<string, unknown>) ?? {};
  const monthly = ((outputs.monthly as Record<string, unknown> | undefined)?.fixed as Array<Record<string, unknown>> | undefined) ?? [];

  const inputs = (json.inputs as Record<string, unknown>) ?? {};
  const meteo = (inputs.meteo_data as Record<string, unknown>) ?? {};
  const location = (inputs.location as Record<string, unknown>) ?? {};

  return {
    fonte: "pvgis",
    produzione_annua_kwh: fixed.E_y as number ?? kwp * 1300, // fallback
    produzione_mensile_kwh: monthly.map((m) => m.E_m as number),
    perdite_totali_pct: fixed.l_total as number ?? 14,
    elevation: location.elevation as number ?? null,
    raddatabase: meteo.radiation_db as string ?? "PVGIS-SARAH2",
    ore_sole_annue_equivalenti: kwp > 0 ? Math.round(((fixed.E_y as number) ?? 0) / kwp) : 0,
  };
}

function buildMockPvgis(lat: number, _lng: number, kwp: number, tilt: number, _azimuth: number): Record<string, unknown> {
  // Stima Italia: 1100-1500 kWh/kWp/anno (nord 1100, centro 1300, sud 1450, isole 1500)
  const oreSole = lat >= 44 ? 1100 : lat >= 41 ? 1300 : lat >= 38 ? 1450 : 1500;
  const fattoreTilt = tilt >= 25 && tilt <= 35 ? 1.0 : 0.95;
  const produzione_annua = Math.round(kwp * oreSole * 0.85 * fattoreTilt);

  // Distribuzione mensile centro-Italia approssimata
  const distMese = [0.04, 0.055, 0.085, 0.10, 0.115, 0.125, 0.13, 0.115, 0.10, 0.075, 0.045, 0.035];
  const monthly = distMese.map((p) => Math.round(produzione_annua * p));

  return {
    fonte: "pvgis",
    produzione_annua_kwh: produzione_annua,
    produzione_mensile_kwh: monthly,
    perdite_totali_pct: 14,
    elevation: 100,
    raddatabase: "PVGIS-SARAH2 (mock)",
    ore_sole_annue_equivalenti: oreSole,
    _mock: true,
  };
}
