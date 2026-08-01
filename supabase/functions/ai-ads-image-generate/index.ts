// supabase/functions/ai-ads-image-generate/index.ts
//
// Genera immagini per Meta Ads via OpenAI Images Generation API (gpt-image-1).
// Salva in storage Supabase + crea record in ad_media.
//
// SICUREZZA:
//   • Bearer token utente
//   • Validazione company ownership
//   • Tracking costo in ad_media (per audit)
//
// FLUSSO:
//   1. Riceve prompt + formato (1:1, 4:5, 9:16, 16:9)
//   2. Chiama OpenAI /v1/images/generations
//   3. Riceve immagine base64
//   4. Salva su Supabase Storage bucket `ad-media`
//   5. Insert in ad_media + ritorna public_url
//
// COSTI gpt-image-1 (2026):
//   • 1024x1024: ~0.04 USD
//   • 1024x1536 (4:5/9:16): ~0.06 USD

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
// MP-SILVIO-CREATIVE-01: canoni brand condivisi (single source chat+social)
import {
  aspectToOpenAiSize,
  buildBrandedImagePrompt,
  costoImmagineUsd,
  costoImmagineCentesimiEur,
  qualityPerModello,
  richiedeRitaglio,
  NEGATIVE_PROMPT_CREATIVITA,
  type CreativeAspect,
} from "../_shared/brandCreativeRules.ts";
import { generateImage } from "../_shared/ai-provider/image.ts";
import { caricaBrandAzienda, verificaQuotaCreativita } from "../_shared/creativeContext.ts";
import { gateAiPayment } from "../_shared/requirePaymentMethod.ts";
import { chargeDirectAiCall } from "../_shared/directAiLedger.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const OPENAI_IMAGE_MODEL = Deno.env.get("OPENAI_IMAGE_MODEL") || "gpt-image-1";
const STORAGE_BUCKET = "ad-media";

interface ImageGenRequest {
  company_id: string;
  prompt: string;
  /** Aspect ratio: 1:1, 4:5, 9:16, 16:9 */
  aspect_ratio?: "1:1" | "4:5" | "9:16" | "16:9";
  /** Quality: standard | hd (più costoso) */
  quality?: "standard" | "hd";
  /** Optional tags per catalogazione */
  tags?: string[];
  /**
   * Id stabile generato dal client per la singola richiesta: un retry di
   * rete riusa lo stesso id → l'addebito nel ledger è deduplicato
   * (UNIQUE su idempotency_key in charge_ai_call).
   */
  client_request_id?: string;
}

interface ImageGenResponse {
  success: boolean;
  media_id?: string;
  public_url?: string;
  width_px?: number;
  height_px?: number;
  cost_eur_cents?: number;
  /** true se il formato richiesto va ritagliato prima di pubblicare (es. 9:16). */
  richiede_ritaglio?: boolean;
  error?: string;
  detail?: string;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, corsHeaders);

  try {
    // Basta UNA delle due chiavi: la catena parte da OpenRouter e ripiega su
    // OpenAI diretto. Bloccare per la sola OPENAI_API_KEY mancante negherebbe
    // il servizio anche quando OpenRouter è perfettamente configurato.
    if (!OPENAI_API_KEY && !Deno.env.get("OPENROUTER_API_KEY")) {
      return json({ error: "image_api_key_missing" }, 503, corsHeaders);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401, corsHeaders);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: { user } } = await userClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) return json({ error: "unauthorized" }, 401, corsHeaders);

    let body: ImageGenRequest;
    try {
      body = (await req.json()) as ImageGenRequest;
    } catch {
      return json({ error: "invalid_json" }, 400, corsHeaders);
    }
    if (!body.company_id || !body.prompt || body.prompt.length < 10) {
      return json({ error: "prompt_too_short" }, 400, corsHeaders);
    }

    // AUTHZ
    const { data: profile } = await admin
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.company_id !== body.company_id) {
      const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
      const isSA = (roles ?? []).some((r) => r.role === "super_admin");
      if (!isSA) return json({ error: "forbidden" }, 403, corsHeaders);
    }

    // Gate carta (audit AI 2026-06): generazione immagini a costo OpenAI
    // diretto, prima senza alcun controllo sul metodo di pagamento.
    const paymentBlock = await gateAiPayment(admin, body.company_id, corsHeaders);
    if (paymentBlock) return paymentBlock;

    // Tetto giornaliero condiviso con la chat (audit creatività 01/08): senza,
    // bastava alternare i due canali per generare all'infinito.
    const quota = await verificaQuotaCreativita(admin, body.company_id);
    if (!quota.consentito) {
      return json({
        success: false,
        error: "creative_daily_cap",
        detail: quota.messaggio,
      }, 429, corsHeaders);
    }

    // Mapping aspect_ratio → size OpenAI (canone condiviso brandCreativeRules)
    const ar = body.aspect_ratio ?? "1:1";
    const size = aspectToOpenAiSize(ar);

    const quality = body.quality ?? "standard";

    // SAFETY filter + identità aziendale: colori e mestiere reali nel prompt.
    const brand = await caricaBrandAzienda(admin, body.company_id);
    const enhancedPrompt = buildBrandedImagePrompt(body.prompt, brand);

    // FIX FATTURAZIONE (audit creatività 01/08): la qualità richiesta non
    // veniva MAI inviata a gpt-image-1 ma il prezzo la conteggiava → chi
    // sceglieva "hd" pagava il doppio per un'immagine identica. Ora viene
    // tradotta nella scala del modello (medium|high) e il prezzo si calcola su
    // ciò che è stato davvero applicato.
    const qualitaApplicata = qualityPerModello(OPENAI_IMAGE_MODEL, quality);
    // GENERAZIONE via catena condivisa OpenRouter → OpenAI diretto.
    // Prima questa funzione parlava solo con OpenAI: un disservizio OpenAI
    // fermava le creatività mentre i render (che usano la catena) continuavano.
    let gen;
    try {
      gen = await generateImage({
        prompt: enhancedPrompt,
        negativePrompt: NEGATIVE_PROMPT_CREATIVITA,
        size,
        openaiQuality: (qualitaApplicata as "low" | "medium" | "high" | undefined) ?? undefined,
        metadata: { task_kind: "ads_image_generate", company_id: body.company_id },
      });
    } catch (e) {
      console.error("[ai-ads-image-generate] tutti i provider falliti:", e);
      return json({
        success: false,
        error: "image_provider_error",
        detail: e instanceof Error ? e.message.substring(0, 500) : String(e),
      }, 502, corsHeaders);
    }

    // Se il ramo OpenAI ha dovuto togliere `quality`, il cliente ha ricevuto
    // la qualità di default: si fattura quella, non quella richiesta.
    const qualityFatturata: "standard" | "hd" =
      (gen.rawResponse as { quality_rimossa?: boolean })?.quality_rimossa ? "standard" : quality;

    // DECODE data URL → bytes
    const b64 = gen.imageDataUrl.split(",")[1] ?? "";
    if (!b64) {
      return json({ error: "no_image_returned" }, 502, corsHeaders);
    }
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

    // UPLOAD su Storage
    const ext = "png";
    const fileName = `${body.company_id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const { error: uploadErr } = await admin.storage
      .from(STORAGE_BUCKET)
      .upload(fileName, bytes, {
        contentType: "image/png",
        upsert: false,
      });
    if (uploadErr) {
      // Se bucket non esiste, crealo
      if (String(uploadErr.message).includes("not found")) {
        await admin.storage.createBucket(STORAGE_BUCKET, {
          public: true,
          fileSizeLimit: 10 * 1024 * 1024, // 10 MB
        });
        // Riprova
        const retry = await admin.storage
          .from(STORAGE_BUCKET)
          .upload(fileName, bytes, { contentType: "image/png" });
        if (retry.error) {
          return json({ error: "upload_failed", detail: String(retry.error.message) }, 500, corsHeaders);
        }
      } else {
        return json({ error: "upload_failed", detail: String(uploadErr.message) }, 500, corsHeaders);
      }
    }

    const { data: pub } = admin.storage.from(STORAGE_BUCKET).getPublicUrl(fileName);
    const publicUrl = pub.publicUrl;

    // Prezzo centralizzato in brandCreativeRules, calcolato sulla qualità
    // REALMENTE applicata (`qualityFatturata`): se il retry ha tolto il
    // parametro, il cliente paga standard perché standard ha ricevuto.
    const costEurCents = costoImmagineCentesimiEur({
      model: gen.modelUsed,
      size,
      quality: qualityFatturata,
    });
    // OpenRouter restituisce il costo REALE nell'header x-or-cost: quando c'è,
    // batte qualunque stima da listino.
    const costRealUsd = gen.costUsd ?? costoImmagineUsd({
      model: gen.modelUsed,
      size,
      quality: qualityFatturata,
    });

    // INSERT in ad_media
    const [widthStr, heightStr] = size.split("x");
    const { data: media, error: mediaErr } = await admin
      .from("ad_media")
      .insert({
        company_id: body.company_id,
        name: body.prompt.substring(0, 80),
        kind: "image",
        source: "ai_generated",
        storage_bucket: STORAGE_BUCKET,
        storage_path: fileName,
        public_url: publicUrl,
        width_px: parseInt(widthStr, 10),
        height_px: parseInt(heightStr, 10),
        mime_type: "image/png",
        aspect_ratio: ar,
        ai_prompt: body.prompt,
        ai_model: gen.modelUsed,
        ai_provider: gen.providerUsed, // openrouter | openai_direct
        ai_cost_eur_cents: costEurCents,
        tags: body.tags ?? [],
        created_by: user.id,
      })
      .select("id")
      .single();

    if (mediaErr) {
      const msg = String(mediaErr.message ?? "");
      if (msg.includes("does not exist") || msg.includes("schema cache")) {
        return json({
          error: "schema_not_applied",
          detail: "Migration 20260522150000 (ad_media) non applicata.",
        }, 503, corsHeaders);
      }
      return json({ error: "ad_media_insert_failed", detail: msg }, 500, corsHeaders);
    }

    // Addebito nel ledger AI centrale (audit AI 2026-06): prima il costo
    // restava SOLO su ad_media → invisibile al billing aziendale e ai cap
    // di budget, e un retry generava doppia spesa non rilevabile. Best-effort:
    // l'immagine è già stata generata e salvata, un errore di charge non
    // deve negarla all'utente (fail-open con log, come AI_DIRECT_ALLOW_CHARGE_FAIL_OPEN).
    const idempotencyKey = body.client_request_id
      ? `ads-image:${body.company_id}:${body.client_request_id}`
      : `ads-image:${crypto.randomUUID()}`;
    try {
      await chargeDirectAiCall({
        supabase: admin,
        idempotencyKey,
        companyId: body.company_id,
        userId: user.id,
        taskKey: "ads_image_generate",
        tierKey: "t2_vision",
        modelUsed: OPENAI_IMAGE_MODEL,
        tokensIn: 0,
        tokensOut: 0,
        costRealUsd,
        metadata: {
          media_id: media?.id ?? null,
          aspect_ratio: ar,
          quality_richiesta: quality,
          quality_applicata: qualityFatturata,
        },
      });
    } catch (chargeErr) {
      console.error("[ai-ads-image-generate] ledger charge failed (image già consegnata):", chargeErr);
    }

    const result: ImageGenResponse = {
      success: true,
      media_id: media?.id,
      public_url: publicUrl,
      width_px: parseInt(widthStr, 10),
      height_px: parseInt(heightStr, 10),
      cost_eur_cents: costEurCents,
      // Il formato generabile non coincide sempre con quello social (9:16):
      // il compositore lato client ritaglia prima della pubblicazione.
      richiede_ritaglio: richiedeRitaglio(ar as CreativeAspect),
    };
    return json(result, 200, corsHeaders);
  } catch (e) {
    console.error("[ai-ads-image-generate] uncaught", e);
    return json({ error: "internal_error", detail: String(e) }, 500, corsHeaders);
  }
});

function json(payload: unknown, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
