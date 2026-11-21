/** Google Solar autentico, per progetto autorizzato. Chiavi e URL GeoTIFF restano sul server. */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  errorResponse,
  getCorsHeaders,
  jsonResponse,
} from "../_shared/headers.ts";
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";
import {
  dataSolar,
  leggiRispostaSolar,
  posizioneSolarValida,
  urlTiffSolar,
} from "../_shared/fvGoogleSolar.ts";

const MAX_TIFF = 12 * 1024 * 1024;
function base64(bytes: Uint8Array) {
  let b = "";
  for (let i = 0; i < bytes.length; i += 32768) {
    b += String.fromCharCode(...bytes.subarray(i, i + 32768));
  }
  return btoa(b);
}
Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405, cors);
  }
  try {
    const { userId, supabaseAdmin: sb } = await requireAuth(req, cors);
    const p = await req.json();
    if (
      typeof p.progetto_id !== "string" ||
      !/^[a-f0-9-]{36}$/.test(p.progetto_id) ||
      !posizioneSolarValida({ lat: p.lat, lng: p.lng })
    ) {
      return errorResponse(
        "Indica il progetto e una posizione valida del tetto",
        400,
        cors,
      );
    }
    const { data: proj, error: pe } = await sb.from("fv_progetti").select(
      "id,company_id,stato",
    ).eq("id", p.progetto_id).maybeSingle();
    if (pe || !proj) {
      return errorResponse("Progetto non disponibile", 404, cors);
    }
    await requireCompanyAccess(sb, userId, proj.company_id, cors);
    const utente = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
        auth: { persistSession: false },
      },
    );
    const { data: permesso, error: permessoErrore } = await utente.rpc(
      "fv_solar_accesso",
      { p_progetto: proj.id },
    );
    if (permessoErrore || permesso !== true) {
      return errorResponse(
        "Serve una bozza modificabile e il permesso di modifica preventivi per analizzare il tetto",
        403,
        cors,
      );
    }
    const azione = p.azione ?? "insights";
    if (!["insights", "layers", "raster", "salva_foto"].includes(azione)) {
      return errorResponse("Operazione non valida", 400, cors);
    }
    if (azione === "salva_foto") {
      if (!["bozza", "configurato"].includes(proj.stato)) {
        return errorResponse(
          "La foto si salva in una bozza modificabile",
          409,
          cors,
        );
      }
      if (
        typeof p.contenuto !== "string" ||
        p.contenuto.length > 3 * 1024 * 1024 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(p.contenuto)
      ) return errorResponse("Foto non valida", 400, cors);
      const bytes = Uint8Array.from(atob(p.contenuto), (c) => c.charCodeAt(0));
      if (
        bytes.length < 20 || bytes.length > 2 * 1024 * 1024 ||
        bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255
      ) return errorResponse("Foto JPEG non valida", 400, cors);
      const path =
        `${proj.company_id}/${proj.id}/solar/${crypto.randomUUID()}.jpg`;
      const { error } = await sb.storage.from("fv-progetti").upload(
        path,
        bytes,
        { contentType: "image/jpeg", upsert: false },
      );
      if (error) throw Error("Salvataggio della foto non riuscito");
      return jsonResponse({ path }, 200, cors);
    }
    const key = Deno.env.get("GOOGLE_SOLAR_API_KEY") ||
      await getPlatformSetting("google_solar_api_key");
    if (!key) {
      return jsonResponse(
        {
          error: "SOLAR_NOT_CONFIGURED",
          message:
            "Google Solar non è ancora collegato. Puoi continuare con la mappa e le misure inserite.",
        },
        200,
        cors,
      );
    }
    const punto = { lat: p.lat as number, lng: p.lng as number };
    const endpoint = azione === "insights" ? "buildingInsights" : "dataLayers";
    const cacheKey = `solar:v3:${endpoint}:${punto.lat.toFixed(6)},${
      punto.lng.toFixed(6)
    }`;
    const adesso = Date.now();
    const { data: cache } = await sb.from("fv_solar_api_cache").select(
      "response,created_at,expires_at",
    ).eq("cache_key", cacheKey).gt("expires_at", new Date(adesso).toISOString())
      .gte("created_at", new Date(adesso - 30 * 86400000).toISOString())
      .maybeSingle();
    let raw = cache?.response;
    if (raw?._mock) raw = null;
    if (!raw) {
      const { data: prenotata, error: qe } = await sb.rpc(
        "fv_solar_prenota_richiesta",
        { p_azienda: proj.company_id, p_endpoint: endpoint },
      );
      if (qe) {
        throw Error(
          "Il controllo di disponibilità Solar non risponde: riprova",
        );
      }
      if (!prenotata) {
        return jsonResponse(
          {
            error: "SOLAR_QUOTA",
            message:
              "Limite delle richieste Google Solar raggiunto. Puoi continuare con il disegno salvato.",
          },
          200,
          cors,
        );
      }
      const url = new URL(
        `https://solar.googleapis.com/v1/${
          endpoint === "buildingInsights"
            ? "buildingInsights:findClosest"
            : "dataLayers:get"
        }`,
      );
      url.searchParams.set("location.latitude", String(punto.lat));
      url.searchParams.set("location.longitude", String(punto.lng));
      url.searchParams.set("requiredQuality", "LOW");
      if (endpoint === "dataLayers") {
        url.searchParams.set("radiusMeters", "50");
        url.searchParams.set("view", "IMAGERY_LAYERS");
        url.searchParams.set("pixelSizeMeters", "0.1");
      }
      const upstream = await fetch(url, {
        headers: { "X-Goog-Api-Key": key },
        redirect: "error",
        signal: AbortSignal.timeout(20000),
      });
      if (!upstream.ok) {
        if (upstream.status === 404) {
          await sb.from("fv_solar_api_cache").upsert({
            cache_key: cacheKey,
            endpoint,
            response: { error: "NOT_FOUND" },
            quality_level: "NOT_FOUND",
            created_at: new Date(adesso).toISOString(),
            expires_at: new Date(adesso + 86400000).toISOString(),
          }, { onConflict: "cache_key" });
        }
        await sb.from("fv_solar_api_usage").update({ source: "error" }).eq(
          "id",
          prenotata,
        );
        const error = upstream.status === 404
          ? "NOT_FOUND"
          : upstream.status === 429
          ? "SOLAR_QUOTA"
          : upstream.status === 403
          ? "SOLAR_NOT_AUTHORIZED"
          : "SOLAR_UNAVAILABLE";
        return jsonResponse(
          {
            error,
            message: error === "NOT_FOUND"
              ? "Google Solar non ha dati per questo tetto. La mappa e il disegno salvato restano disponibili."
              : error === "SOLAR_NOT_AUTHORIZED"
              ? "Google non ha autorizzato Solar API: l’amministratore deve verificare servizio e chiave."
              : "Google Solar non è disponibile in questo momento. Riprova.",
          },
          200,
          cors,
        );
      }
      raw = await upstream.json();
      const valida = endpoint === "buildingInsights"
        ? !!leggiRispostaSolar(raw)
        : !!urlTiffSolar(raw.rgbUrl) && !!urlTiffSolar(raw.dsmUrl) &&
          !!urlTiffSolar(raw.maskUrl);
      if (!valida) {
        return jsonResponse(
          {
            error: "SOLAR_INCOMPLETE",
            message: "Google non ha restituito dati completi per questo tetto.",
          },
          200,
          cors,
        );
      }
      const now = new Date().toISOString();
      const { error: ce } = await sb.from("fv_solar_api_cache").upsert({
        cache_key: cacheKey,
        endpoint,
        response: raw,
        quality_level: raw.imageryQuality,
        imagery_date: dataSolar(raw.imageryDate),
        created_at: now,
        expires_at: new Date(
          adesso + (endpoint === "dataLayers" ? 55 * 60000 : 30 * 86400000),
        ).toISOString(),
      }, { onConflict: "cache_key" });
      if (ce) throw Error("Cache Solar non salvata: riprova più tardi");
    }
    if (raw?.error === "NOT_FOUND") {
      return jsonResponse(
        {
          error: "NOT_FOUND",
          message:
            "Google Solar non ha dati per questo tetto. La mappa e il disegno salvato restano disponibili.",
        },
        200,
        cors,
      );
    }
    if (azione === "insights") {
      return jsonResponse(leggiRispostaSolar(raw), 200, cors);
    }
    if (azione === "layers") {
      return jsonResponse(
        {
          qualitaGoogle: raw.imageryQuality,
          imagery_date: dataSolar(raw.imageryDate),
          disponibile: true,
        },
        200,
        cors,
      );
    }
    if (!["rgb", "dsm", "mask"].includes(p.livello)) {
      return errorResponse("Livello non valido", 400, cors);
    }
    const url = urlTiffSolar(raw[`${p.livello}Url`]);
    if (!url) throw Error("Immagine Solar non disponibile");
    const res = await fetch(url, {
      headers: { "X-Goog-Api-Key": key },
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      return jsonResponse(
        {
          error: "SOLAR_IMAGE_UNAVAILABLE",
          message: "L’immagine Google non si è caricata. Riprova l’analisi.",
        },
        200,
        cors,
      );
    }
    if (Number(res.headers.get("Content-Length")) > MAX_TIFF) {
      throw Error("Immagine Solar troppo grande");
    }
    const reader = res.body?.getReader();
    if (!reader) throw Error("Immagine Solar vuota");
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_TIFF) {
        await reader.cancel();
        throw Error("Immagine Solar troppo grande");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return jsonResponse(
      {
        contenuto: base64(bytes),
        qualitaGoogle: raw.imageryQuality,
        imagery_date: dataSolar(raw.imageryDate),
      },
      200,
      cors,
    );
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(
      "[fv-solar-api-fetch]",
      e instanceof Error ? e.name : "Errore",
    );
    return errorResponse(
      "Google Solar non risponde. Riprova; puoi continuare con il disegno salvato.",
      503,
      cors,
    );
  }
});
