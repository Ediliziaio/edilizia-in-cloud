/**
 * silvio-generation-worker — MP-SILVIO-CREATIVE-01 (deferred #2)
 *
 * Processa i job IMAGE in coda (silvio_generation_jobs) creati DOPO l'approvazione
 * umana del tool yellow `genera_creativita`. Chiama OpenAI Images direttamente
 * riusando i canoni di brand condivisi (brandCreativeRules) — NON tocca il motore
 * social live (che richiede JWT utente). Carica su bucket ad-media e aggiorna il job.
 *
 * Sicurezza: solo chiamata interna (x-internal-cron-secret). Claim atomico via
 * UPDATE condizionale (no doppio-processing). Errore → status 'failed' (no retry-loop).
 * video/document: lasciati in coda (worker dedicati successivi).
 *
 * Trigger: cron ogni 2 min (silvio_invoke_edge). Manuale: super_admin POST.
 */

import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { isInternalRequest, requireInternalSecret, requireAuth } from "../_shared/auth.ts";
import { buildBrandedImagePrompt, aspectToOpenAiSize } from "../_shared/brandCreativeRules.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const OPENAI_IMAGE_MODEL = Deno.env.get("OPENAI_IMAGE_MODEL") || "gpt-image-1";
const STORAGE_BUCKET = "ad-media";
const MAX_JOBS_PER_RUN = 5;

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    if (isInternalRequest(req)) {
      requireInternalSecret(req, cors);
    } else {
      await requireAuth(req, cors); // super_admin debug
    }

    if (!OPENAI_API_KEY) return errorResponse("OPENAI_API_KEY non configurato", 500, cors);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin: any = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    // ── Reconciler (idempotente, eseguito a ogni tick) ────────────────────────
    // 1) job bloccati in 'processing' (worker crashato a metà) → failed dopo 10 min.
    const staleCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: staleReset } = await admin
      .from("silvio_generation_jobs")
      .update({ status: "failed", error: "timeout: elaborazione non completata entro 10 minuti", updated_at: new Date().toISOString() })
      .eq("status", "processing")
      .lt("updated_at", staleCutoff)
      .select("id");
    // 2) job orfani: tipo video/document non sono gestiti da questo worker → falliscili
    //    subito con motivo chiaro invece di lasciarli 'queued' all'infinito.
    const { data: orphanReset } = await admin
      .from("silvio_generation_jobs")
      .update({ status: "failed", error: "tipo non supportato: il generatore elabora solo immagini", updated_at: new Date().toISOString() })
      .eq("status", "queued")
      .in("tipo", ["video", "document"])
      .select("id");
    const staleFailed = (staleReset ?? []).length;
    const orphanFailed = (orphanReset ?? []).length;

    const { data: candidates } = await admin
      .from("silvio_generation_jobs")
      .select("id, company_id, brief, formato")
      .eq("status", "queued")
      .eq("tipo", "image")
      .order("created_at", { ascending: true })
      .limit(MAX_JOBS_PER_RUN);

    let processed = 0, failed = 0, skipped = 0;

    for (const job of (candidates ?? [])) {
      // claim atomico: solo chi porta lo stato queued→processing prosegue
      const { data: claimed } = await admin
        .from("silvio_generation_jobs")
        .update({ status: "processing", updated_at: new Date().toISOString() })
        .eq("id", job.id).eq("status", "queued")
        .select("id").maybeSingle();
      if (!claimed) { skipped++; continue; }

      try {
        const prompt = buildBrandedImagePrompt(job.brief ?? "");
        const size = aspectToOpenAiSize(job.formato);
        // gpt-image-1 ritorna b64_json di default e NON accetta response_format/quality 'standard'
        // (param DALL·E). Body model-aware per evitare 400 "Unknown parameter".
        const isGptImage = OPENAI_IMAGE_MODEL.startsWith("gpt-image");
        const reqBody = isGptImage
          ? { model: OPENAI_IMAGE_MODEL, prompt, size, n: 1 }
          : { model: OPENAI_IMAGE_MODEL, prompt, size, n: 1, quality: "standard", response_format: "b64_json" };
        const resp = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
          body: JSON.stringify(reqBody),
        });
        if (!resp.ok) throw new Error(`openai ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
        const data = await resp.json() as { data?: Array<{ b64_json: string }> };
        const b64 = data.data?.[0]?.b64_json;
        if (!b64) throw new Error("openai: nessuna immagine");

        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const fileName = `${job.company_id}/silvio-${Date.now()}-${crypto.randomUUID()}.png`;
        let up = await admin.storage.from(STORAGE_BUCKET).upload(fileName, bytes, { contentType: "image/png", upsert: false });
        if (up.error) {
          // bucket mancante → crealo e riprova
          await admin.storage.createBucket(STORAGE_BUCKET, { public: true }).catch(() => {});
          up = await admin.storage.from(STORAGE_BUCKET).upload(fileName, bytes, { contentType: "image/png", upsert: false });
          if (up.error) throw new Error(`upload: ${up.error.message}`);
        }
        const { data: pub } = admin.storage.from(STORAGE_BUCKET).getPublicUrl(fileName);

        await admin.from("silvio_generation_jobs").update({
          status: "ready", public_url: pub.publicUrl,
          result: { file: fileName, size }, updated_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        }).eq("id", job.id);
        processed++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await admin.from("silvio_generation_jobs").update({
          status: "failed", error: msg.slice(0, 500), updated_at: new Date().toISOString(),
        }).eq("id", job.id);
        failed++;
        console.error(`[gen-worker] job ${job.id} fail:`, msg);
      }
    }

    return jsonResponse({ ok: true, processed, failed, skipped, stale_failed: staleFailed, orphan_failed: orphanFailed, claimed_candidates: (candidates ?? []).length }, 200, cors);
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[gen-worker] fatal", msg);
    return errorResponse(`Fatal: ${msg}`, 500, cors);
  }
});
