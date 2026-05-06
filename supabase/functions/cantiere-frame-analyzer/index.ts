/**
 * cantiere-frame-analyzer — analizza frame video cantiere per safety
 *
 * Endpoint webhook chiamato da:
 *   - device IP camera (con device_token bearer)
 *   - app mobile capomastri (multipart upload con auth)
 *   - drone (con device_token)
 *
 * Body multipart:
 *   - frame: image file (JPG/PNG)
 *   - device_token: per identificare device (bypass auth user)
 *
 * Flow:
 *   1. Verifica device_token → carica device
 *   2. Salva frame in storage
 *   3. AI Vision analysis (gpt-4o-mini): persons, DPI, falls, fire, unauth
 *   4. Salva risultato in cantiere_video_frames
 *   5. Se severity >= threshold → invia alert (WhatsApp/email)
 */
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { aiRouterComplete } from "../_shared/aiRouter.ts";

const SAFETY_PROMPT = `Sei un esperto sicurezza cantiere edile italiano (D.Lgs 81/08).
Analizza la foto cantiere e identifica violazioni o rischi.

OUTPUT: solo JSON valido. Schema:
{
  "persons_detected": <numero persone visibili>,
  "dpi_compliance_pct": <0-100, % persone con DPI corretti>,
  "violations": [
    {
      "type": "missing_helmet|missing_safety_shoes|missing_harness|fall_detected|unauthorized_access|fire|smoke|equipment_unsafe|trip_hazard",
      "severity": "low|medium|high|critical",
      "confidence": 0..1,
      "description": "Descrizione sintetica violazione"
    }
  ],
  "overall_severity": "safe|low|medium|high|critical",
  "summary": "Riassunto in 1-2 frasi"
}

REGOLE:
- "safe" se nessuna violazione rilevata
- "critical" se: caduta in atto, fuoco/fumo, persona in zona pericolosa
- "high" se: lavori in quota senza imbragatura, persona senza casco vicino a movimentazione carichi
- "medium" se: DPI parziali, attrezzature non a norma visibili
- "low" se: aspetti minori (pulizia cantiere, segnaletica mancante)
- Confidence: alta solo se vedi chiaramente; sotto 0.7 segnala come "da verificare"
- Italiano nelle description
- NO markdown, NO prose, SOLO JSON`;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("method_not_allowed", { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return jsonErr("invalid_form_data");
  }

  const deviceToken = formData.get("device_token") as string;
  const frameFile = formData.get("frame") as File;

  if (!deviceToken || !frameFile) {
    return jsonErr("missing_device_token_or_frame");
  }

  // Verifica device
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: device } = await (supabase as any)
    .from("cantiere_camera_devices")
    .select("*")
    .eq("device_token", deviceToken)
    .eq("is_active", true)
    .single();

  if (!device) {
    return jsonErr("device_not_found", 401);
  }

  // Upload frame
  const framePath = `cameras/${device.company_id}/${device.id}/${Date.now()}.jpg`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: uploadErr } = await (supabase as any).storage
    .from("documenti-smart")
    .upload(framePath, frameFile, { contentType: frameFile.type });

  if (uploadErr) {
    return jsonErr(`upload_failed: ${uploadErr.message}`, 500);
  }

  // Update last_frame_at
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from("cantiere_camera_devices")
    .update({ last_frame_at: new Date().toISOString(), last_seen_at: new Date().toISOString() })
    .eq("id", device.id);

  // Skip AI analysis se disabilitato
  if (!device.ai_analysis_enabled) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: frame } = await (supabase as any)
      .from("cantiere_video_frames")
      .insert({
        device_id: device.id,
        company_id: device.company_id,
        cantiere_id: device.cantiere_id,
        frame_storage_path: framePath,
      })
      .select("id")
      .single();
    return jsonOk({ frame_id: frame?.id, ai_skipped: true });
  }

  // Signed URL per AI vision
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: signed } = await (supabase as any).storage
    .from("documenti-smart")
    .createSignedUrl(framePath, 3600);

  if (!signed?.signedUrl) {
    return jsonErr("signed_url_failed", 500);
  }

  // AI analysis
  let analysis: {
    persons_detected: number;
    dpi_compliance_pct: number;
    violations: Array<{ type: string; severity: string; confidence: number; description: string }>;
    overall_severity: string;
    summary: string;
  };

  try {
    const aiRes = await aiRouterComplete({
      supabase,
      taskKey: "vision_cantiere",
      messages: [
        { role: "system", content: SAFETY_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Analizza per violazioni sicurezza." },
            { type: "image_url", image_url: { url: signed.signedUrl } },
          ] as unknown as string,
        },
      ],
      params: { temperature: 0.1, max_tokens: 1200 },
      companyId: device.company_id,
      personaKey: "compliance",
      estimatedCostEur: 0.04,
    });

    let text = aiRes.content.trim();
    if (text.startsWith("```")) {
      text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    }
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      text = text.slice(start, end + 1);
    }
    analysis = JSON.parse(text);
  } catch (e) {
    analysis = {
      persons_detected: 0,
      dpi_compliance_pct: 0,
      violations: [],
      overall_severity: "safe",
      summary: `AI analisi fallita: ${(e as Error).message}`,
    };
  }

  // Salva frame con analisi
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: frame } = await (supabase as any)
    .from("cantiere_video_frames")
    .insert({
      device_id: device.id,
      company_id: device.company_id,
      cantiere_id: device.cantiere_id,
      frame_storage_path: framePath,
      ai_persons_detected: analysis.persons_detected,
      ai_dpi_compliance_pct: analysis.dpi_compliance_pct,
      ai_violations: analysis.violations,
      ai_overall_severity: analysis.overall_severity,
      ai_summary: analysis.summary,
      ai_cost_billed_eur: 0.04,
    })
    .select("id")
    .single();

  // Alert se severity >= threshold
  const severityRank: Record<string, number> = { safe: 0, low: 1, medium: 2, high: 3, critical: 4 };
  const thresholdRank = severityRank[device.alert_severity_threshold] ?? 2;
  const currentRank = severityRank[analysis.overall_severity] ?? 0;

  if (currentRank >= thresholdRank && currentRank >= severityRank.medium) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("notifications").insert({
        company_id: device.company_id,
        type: "cantiere_safety_alert",
        severity: analysis.overall_severity === "critical" ? "high" : "medium",
        title: `🚨 Sicurezza cantiere: ${analysis.overall_severity}`,
        body: `${device.device_name}: ${analysis.summary}`,
        metadata: {
          device_id: device.id,
          frame_id: frame?.id,
          violations: analysis.violations,
          source: "cantiere-frame-analyzer",
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("cantiere_video_frames")
        .update({ alert_sent: true, alert_sent_at: new Date().toISOString() })
        .eq("id", frame?.id);
    } catch (e) {
      console.error("alert_send_failed", e);
    }
  }

  return jsonOk({
    frame_id: frame?.id,
    severity: analysis.overall_severity,
    summary: analysis.summary,
    violations_count: analysis.violations.length,
    alert_sent: currentRank >= thresholdRank && currentRank >= severityRank.medium,
  });
});

function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify({ ok: true, ...((body as object) ?? {}) }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
function jsonErr(error: string, status = 400): Response {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
