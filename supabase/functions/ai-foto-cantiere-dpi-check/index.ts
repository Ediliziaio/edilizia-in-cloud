/**
 * ai-foto-cantiere-dpi-check — Feature #8
 *
 * Analizza una foto di cantiere via Claude vision per rilevare:
 *  - DPI: caschi, scarpe antinfortunistiche, occhiali, guanti, imbragature
 *  - Ammassi pericolosi: materiali instabili, vie di fuga ostruite
 *  - % avanzamento stimata (se confrontata con foto storiche del cantiere)
 *  - Conformità sicurezza generale
 *
 * STATO: skeleton opt-in. Attiva la chiamata Claude solo se ANTHROPIC_API_KEY
 * è settato. Senza env restituisce risultato vuoto + reason="no_provider".
 *
 * Triggered da:
 *   - Trigger DB su `foto_cantiere` (insert) → invoca questa funzione
 *   - Chiamata manuale da UI cantiere ("Verifica sicurezza")
 *
 * Output:
 *   {
 *     dpi_detected: { hard_hat: bool, safety_shoes: bool, gloves: bool, ... },
 *     hazards: ["materiali_ammassati", "via_fuga_ostruita", ...],
 *     conformita_score: 0-100,
 *     proposals_created: number
 *   }
 *
 * Se mancano DPI critici (caschi, scarpe) → crea proposta yellow
 * `alert_rspp_dpi_mancanti` per il RSPP/capocantiere.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { getCorsHeaders } from "../_shared/headers.ts";
import { anthropicMessages, hasAiProvider } from "../_shared/anthropicMessages.ts";

interface Payload {
  photo_url: string;
  /** ID della riga foto_cantiere (opzionale, per tracciamento) */
  photo_id?: string;
  /** Cantiere/order di riferimento */
  order_id?: string;
  company_id?: string;
}

interface DpiCheck {
  hard_hat: boolean;
  safety_shoes: boolean;
  gloves: boolean;
  safety_glasses: boolean;
  high_vis_vest: boolean;
}

interface VisionResult {
  workers_count: number;
  dpi_detected: DpiCheck;
  hazards: string[];
  conformita_score: number;
  notes: string;
}

const VISION_SYSTEM_PROMPT = `Sei un RSPP (Responsabile Servizio Prevenzione Protezione) di cantiere edile.
Analizza la foto e restituisci esclusivamente JSON con questa struttura:
{
  "workers_count": number,
  "dpi_detected": {
    "hard_hat": boolean,
    "safety_shoes": boolean,
    "gloves": boolean,
    "safety_glasses": boolean,
    "high_vis_vest": boolean
  },
  "hazards": string[],
  "conformita_score": number,
  "notes": string
}
- workers_count: persone visibili nella foto.
- dpi_detected: true SOLO se ogni operaio visibile lo indossa.
- hazards: voci da questa lista: "materiali_ammassati", "via_fuga_ostruita", "ponteggio_irregolare", "elettrico_esposto", "altezza_senza_imbrago".
- conformita_score: 0 (grave) – 100 (perfetto). Considera D.Lgs 81/08.
- notes: max 200 caratteri in italiano sul punto principale.
Restituisci SOLO il JSON, nient'altro.`;

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const body = (await req.json()) as Payload;
  if (!body.photo_url) {
    return new Response(JSON.stringify({ error: "photo_url mancante" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  if (!hasAiProvider()) {
    return new Response(JSON.stringify({
      ok: false,
      reason: "no_provider",
      hint: "Configura OPENROUTER_API_KEY per abilitare il controllo DPI vision",
    }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Chiama Claude vision
  let visionResult: VisionResult | null = null;
  try {
    const data = await anthropicMessages({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: VISION_SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "url", url: body.photo_url } },
          { type: "text", text: "Analizza questa foto di cantiere e restituisci il JSON." },
        ],
      }],
    });
    const text = data?.content?.[0]?.text ?? "{}";
    // Parse JSON tollerante: trova il blocco {...}
    const match = text.match(/\{[\s\S]*\}/);
    if (match) visionResult = JSON.parse(match[0]);
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  if (!visionResult) {
    return new Response(JSON.stringify({ ok: false, error: "vision response unparseable" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let proposalsCreated = 0;
  // Crea proposta SOLO se DPI critici mancanti E abbiamo company_id
  const criticalMissing =
    visionResult.workers_count > 0 &&
    (!visionResult.dpi_detected.hard_hat || !visionResult.dpi_detected.safety_shoes);

  if (criticalMissing && body.company_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: roleRow } = await (supabase as any)
      .from("user_roles")
      .select("user_id")
      .eq("company_id", body.company_id)
      .in("role", ["company_admin", "company_staff"])
      .limit(1)
      .maybeSingle();
    const adminUserId = (roleRow as { user_id?: string } | null)?.user_id;
    if (adminUserId) {
      const missing: string[] = [];
      if (!visionResult.dpi_detected.hard_hat) missing.push("casco");
      if (!visionResult.dpi_detected.safety_shoes) missing.push("scarpe antinfortunistiche");
      if (!visionResult.dpi_detected.gloves) missing.push("guanti");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: propId } = await (supabase as any).rpc("create_proactive_proposal", {
        p_company_id: body.company_id,
        p_user_id: adminUserId,
        p_persona_key: "compliance",
        p_action_type: "alert_rspp_dpi_mancanti",
        p_summary: `Foto cantiere: ${visionResult.workers_count} operai senza ${missing.join(", ")} — alert RSPP?`.slice(0, 200),
        p_payload: {
          photo_url: body.photo_url,
          photo_id: body.photo_id ?? null,
          order_id: body.order_id ?? null,
          workers_count: visionResult.workers_count,
          missing_dpi: missing,
          dpi_detected: visionResult.dpi_detected,
          hazards: visionResult.hazards,
          conformita_score: visionResult.conformita_score,
          notes: visionResult.notes,
        },
        p_signal_type: "foto_cantiere_dpi_mancanti",
        p_signal_entity_id: body.photo_id ?? body.order_id ?? null,
        p_signal_metadata: {
          conformita_score: visionResult.conformita_score,
          hazards_count: visionResult.hazards.length,
        },
        p_risk_level: visionResult.conformita_score < 40 ? "red" : "yellow",
        p_ttl_days: 1,
      });
      if (propId) proposalsCreated += 1;
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    ...visionResult,
    proposals_created: proposalsCreated,
  }, null, 2), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
