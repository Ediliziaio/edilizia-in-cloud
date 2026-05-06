/**
 * MP-OPS-02 — Morning Briefing Capomastri (cron 06:30 Europe/Rome)
 *
 * Itera companies con `morning_briefing_enabled=true`, per ognuna recupera
 * cantieri attivi con capomastro assegnato → fetch meteo Open-Meteo →
 * compose AI persona capocantiere → invia via canale preferito (WhatsApp /
 * Telegram / Push / Email) → log in capomastro_briefings.
 */
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { aiRouterComplete } from "../_shared/aiRouter.ts";

interface CantiereForBriefing {
  cantiere_id: string;
  order_code: string | null;
  capomastro_user_id: string;
  capomastro_name: string;
  capomastro_channel: string;
  capomastro_phone: string | null;
  cantiere_address: string | null;
  cantiere_city: string | null;
  work_description: string | null;
}

interface WeatherSnapshot {
  temp_min: number | null;
  temp_max: number | null;
  wind_kmh: number | null;
  precipitation_mm: number | null;
  description: string;
  raw: Record<string, unknown>;
}

interface SafetyAlert {
  type: "wind_high" | "rain" | "frost" | "heat" | "weather_warning";
  severity: "info" | "warning" | "stop";
  message: string;
}

Deno.serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const t0 = Date.now();
  const summary = {
    companies_processed: 0,
    cantieri_processed: 0,
    briefings_sent: 0,
    skipped: 0,
    errors: 0,
    duration_ms: 0,
    errors_detail: [] as Array<{ cantiere_id: string; message: string }>,
  };

  try {
    // 1. Carica companies con feature attiva
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: companies } = await (supabase as any)
      .from("companies")
      .select("id, name")
      .eq("morning_briefing_enabled", true);

    if (!companies || companies.length === 0) {
      summary.duration_ms = Date.now() - t0;
      return jsonOk({ ...summary, note: "Nessuna company con morning_briefing_enabled=true" });
    }

    summary.companies_processed = companies.length;

    // 2. Per ogni company: lista cantieri da briefare
    for (const c of companies) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: cantData } = await (supabase as any).rpc("silvio_tool_lista_cantieri_per_briefing", {
        p_company_id: c.id,
        p_briefing_date: null,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cantieri: CantiereForBriefing[] = (cantData as any)?.cantieri ?? [];
      summary.cantieri_processed += cantieri.length;

      for (const cant of cantieri) {
        try {
          // 3. Fetch meteo per indirizzo cantiere (Open-Meteo gratuito)
          const weather = await fetchWeather(cant.cantiere_city ?? cant.cantiere_address);
          const safetyAlerts = computeSafetyAlerts(weather);

          // 4. Compose AI message via persona capocantiere
          const message = await composeBriefingMessage({
            supabase,
            companyId: c.id,
            companyName: c.name,
            cantiere: cant,
            weather,
            safetyAlerts,
          });

          // 5. Invio (best-effort: per ora log + future invio reale via canale appropriato)
          const externalId = await sendOnChannel(supabase, cant, message);

          // 6. Log briefing
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).rpc("silvio_tool_log_briefing_sent", {
            p_company_id: c.id,
            p_user_id: cant.capomastro_user_id,
            p_cantiere_id: cant.cantiere_id,
            p_briefing_date: new Date().toISOString().substring(0, 10),
            p_capomastro_user_id: cant.capomastro_user_id,
            p_channel: cant.capomastro_channel,
            p_ai_message: message.text,
            p_weather_data: weather.raw,
            p_safety_alerts: safetyAlerts,
            p_external_message_id: externalId,
            p_ai_cost_billed_eur: message.costBilledEur,
          });
          summary.briefings_sent++;
        } catch (e) {
          summary.errors++;
          summary.errors_detail.push({
            cantiere_id: cant.cantiere_id,
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }

    summary.duration_ms = Date.now() - t0;
    return jsonOk(summary);
  } catch (e) {
    summary.duration_ms = Date.now() - t0;
    return new Response(
      JSON.stringify({ ...summary, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});

function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// ─── Open-Meteo (gratuito, no API key) ───────────────────────────────────────

async function fetchWeather(locationHint: string | null): Promise<WeatherSnapshot> {
  const fallback: WeatherSnapshot = {
    temp_min: null, temp_max: null, wind_kmh: null, precipitation_mm: null,
    description: "Dati meteo non disponibili",
    raw: {},
  };
  if (!locationHint) return fallback;

  try {
    // Geocoding via Open-Meteo
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(locationHint)}&count=1&language=it`;
    const geoRes = await fetch(geoUrl);
    const geoJson = await geoRes.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const place = (geoJson as any)?.results?.[0];
    if (!place) return fallback;

    const wxUrl = `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max&timezone=Europe%2FRome&forecast_days=1`;
    const wxRes = await fetch(wxUrl);
    const wxJson = await wxRes.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = (wxJson as any)?.daily;
    if (!d) return fallback;

    const tempMin: number | null = d.temperature_2m_min?.[0] ?? null;
    const tempMax: number | null = d.temperature_2m_max?.[0] ?? null;
    const wind: number | null = d.wind_speed_10m_max?.[0] ?? null;
    const rain: number | null = d.precipitation_sum?.[0] ?? null;

    let desc = "";
    if (tempMin !== null && tempMax !== null) desc += `${Math.round(tempMin)}°C → ${Math.round(tempMax)}°C`;
    if (rain !== null && rain > 0.1) desc += `, pioggia ${rain.toFixed(1)}mm`;
    if (wind !== null) desc += `, vento ${Math.round(wind)} km/h`;

    return {
      temp_min: tempMin, temp_max: tempMax, wind_kmh: wind, precipitation_mm: rain,
      description: desc || "Sereno",
      raw: { place, daily: d },
    };
  } catch (e) {
    console.warn("[briefing] weather fetch failed:", e instanceof Error ? e.message : String(e));
    return fallback;
  }
}

function computeSafetyAlerts(w: WeatherSnapshot): SafetyAlert[] {
  const alerts: SafetyAlert[] = [];
  if (w.wind_kmh !== null && w.wind_kmh > 40) {
    alerts.push({ type: "wind_high", severity: "stop",
      message: `Vento ${Math.round(w.wind_kmh)} km/h: STOP ponteggi e lavori in quota.` });
  }
  if (w.precipitation_mm !== null && w.precipitation_mm > 5) {
    alerts.push({ type: "rain", severity: "warning",
      message: `Pioggia prevista ${w.precipitation_mm.toFixed(1)}mm: stop getto cls e impermeabilizzazioni.` });
  }
  if (w.temp_min !== null && w.temp_min < 5) {
    alerts.push({ type: "frost", severity: "warning",
      message: `Temperatura minima ${Math.round(w.temp_min)}°C: stop calcestruzzo (UNI EN 13670) e intonaci.` });
  }
  if (w.temp_max !== null && w.temp_max > 35) {
    alerts.push({ type: "heat", severity: "warning",
      message: `Temperatura massima ${Math.round(w.temp_max)}°C: pause obbligatorie operai (D.Lgs 81/08).` });
  }
  return alerts;
}

// ─── AI compose ──────────────────────────────────────────────────────────────

async function composeBriefingMessage(args: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  companyId: string;
  companyName: string;
  cantiere: CantiereForBriefing;
  weather: WeatherSnapshot;
  safetyAlerts: SafetyAlert[];
}): Promise<{ text: string; costBilledEur: number }> {
  const safetySection = args.safetyAlerts.length > 0
    ? args.safetyAlerts.map(a => `⚠️ ${a.message}`).join("\n")
    : "✅ Nessun alert sicurezza meteo.";

  const aiResult = await aiRouterComplete({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: args.supabase,
    taskKey: "email_compose",
    messages: [
      {
        role: "system",
        content: `Sei il capocantiere di ${args.companyName}. Genera un briefing mattutino conciso per il capomastro Mario.
Lingua: italiano. Tono: pratico, diretto. Massimo 250 parole.
Struttura: saluto + cantiere/indirizzo + meteo breve + alert sicurezza se presenti + messaggio finale.
Includi solo info utili, no riempitivi.`,
      },
      {
        role: "user",
        content: [
          `Capomastro: ${args.cantiere.capomastro_name}`,
          `Cantiere: ${args.cantiere.order_code ?? ""} - ${args.cantiere.cantiere_address ?? "n/a"}`,
          `Lavori in corso: ${args.cantiere.work_description ?? "n/a"}`,
          `Meteo previsto: ${args.weather.description}`,
          `Safety alerts:\n${safetySection}`,
        ].join("\n"),
      },
    ],
    params: { temperature: 0.4, max_tokens: 500 },
    companyId: args.companyId,
    estimatedCostEur: 0.02,
    idempotencyKey: `briefing-${args.cantiere.cantiere_id}-${new Date().toISOString().substring(0, 10)}`,
  });

  return {
    text: aiResult.content,
    costBilledEur: aiResult.costBilledEur ?? 0,
  };
}

// ─── Send on channel (placeholder reali) ─────────────────────────────────────

async function sendOnChannel(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  cant: CantiereForBriefing,
  message: { text: string },
): Promise<string | null> {
  const channel = cant.capomastro_channel;

  if (channel === "whatsapp" && cant.capomastro_phone) {
    try {
      const { data } = await supabase.functions.invoke("whatsapp-send", {
        body: { to: cant.capomastro_phone, message: message.text, company_id: undefined },
      });
      return (data as { message_id?: string } | null)?.message_id ?? null;
    } catch {
      return null;
    }
  }

  if (channel === "telegram") {
    // Per now: no-op, in produzione integrare telegram-bot-processor inverse
    console.log("[briefing] telegram delivery not yet wired:", cant.capomastro_user_id);
    return null;
  }

  if (channel === "email") {
    try {
      await supabase.functions.invoke("send-customer-email", {
        body: {
          to_user_id: cant.capomastro_user_id,
          subject: `Briefing mattutino — ${cant.order_code}`,
          html: `<p>${message.text.replace(/\n/g, "<br/>")}</p>`,
        },
      });
      return `email-${Date.now()}`;
    } catch {
      return null;
    }
  }

  return null;
}
