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
import {
  buildBrandedImagePrompt,
  aspectToOpenAiSize,
  costoImmagineUsd,
  qualityPerModello,
  richiedeRitaglio,
  NEGATIVE_PROMPT_CREATIVITA,
  type CreativeAspect,
} from "../_shared/brandCreativeRules.ts";
import { generateImage } from "../_shared/ai-provider/image.ts";
import { caricaBrandAzienda, verificaQuotaCreativita } from "../_shared/creativeContext.ts";
import { checkPaymentMethod } from "../_shared/requirePaymentMethod.ts";
import { chargeDirectAiCall } from "../_shared/directAiLedger.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { serveConMetriche } from "../_shared/withMetrics.ts";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const OPENAI_IMAGE_MODEL = Deno.env.get("OPENAI_IMAGE_MODEL") || "gpt-image-1";
const STORAGE_BUCKET = "ad-media";
const MAX_JOBS_PER_RUN = 5;

serveConMetriche("silvio-generation-worker", async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    if (isInternalRequest(req)) {
      requireInternalSecret(req, cors);
    } else {
      await requireAuth(req, cors); // super_admin debug
    }

    // Basta una delle due chiavi: la catena è OpenRouter → OpenAI diretto.
    if (!OPENAI_API_KEY && !Deno.env.get("OPENROUTER_API_KEY")) {
      return errorResponse("Nessuna chiave immagini configurata (OPENROUTER_API_KEY o OPENAI_API_KEY)", 500, cors);
    }

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
      .select("id, company_id, created_by, brief, formato")
      .eq("status", "queued")
      .eq("tipo", "image")
      .order("created_at", { ascending: true })
      .limit(MAX_JOBS_PER_RUN);

    let processed = 0, failed = 0, skipped = 0, blocked = 0;

    for (const job of (candidates ?? [])) {
      // claim atomico: solo chi porta lo stato queued→processing prosegue
      const { data: claimed } = await admin
        .from("silvio_generation_jobs")
        .update({ status: "processing", updated_at: new Date().toISOString() })
        .eq("id", job.id).eq("status", "queued")
        .select("id").maybeSingle();
      if (!claimed) { skipped++; continue; }

      // ── GATE SOLDI (audit creatività 01/08) ──────────────────────────────
      // Prima di questo blocco il worker generava immagini OpenAI senza gate
      // pagamento e senza addebito: ogni immagine chiesta in chat era costo
      // puro di piattaforma, invisibile al billing — mentre il tool prometteva
      // all'utente "consuma crediti". Stesso pattern già chiuso su render e voce.
      const pagamento = await checkPaymentMethod(admin, job.company_id);
      if (!pagamento.allowed) {
        await admin.from("silvio_generation_jobs").update({
          status: "failed",
          error: pagamento.message ?? "Metodo di pagamento non configurato",
          updated_at: new Date().toISOString(),
        }).eq("id", job.id);
        blocked++;
        continue;
      }
      const quota = await verificaQuotaCreativita(admin, job.company_id);
      if (!quota.consentito) {
        await admin.from("silvio_generation_jobs").update({
          status: "failed",
          error: quota.messaggio ?? "Limite giornaliero raggiunto",
          updated_at: new Date().toISOString(),
        }).eq("id", job.id);
        blocked++;
        continue;
      }

      const t0 = Date.now();
      try {
        // Brand aziendale nel prompt: colori e mestiere reali, non più
        // un'immagine anonima uguale per tutte le aziende.
        const brand = await caricaBrandAzienda(admin, job.company_id);
        const prompt = buildBrandedImagePrompt(job.brief ?? "", brand);
        const size = aspectToOpenAiSize(job.formato);
        // gpt-image-1 ritorna b64_json di default e NON accetta response_format/quality 'standard'
        // (param DALL·E). Body model-aware per evitare 400 "Unknown parameter".
        const qualitaApplicata = qualityPerModello(OPENAI_IMAGE_MODEL, "standard");
        // Catena condivisa OpenRouter → OpenAI diretto: stessa strada dei
        // render, con fallback automatico e costo reale da x-or-cost.
        const gen = await generateImage({
          prompt,
          negativePrompt: NEGATIVE_PROMPT_CREATIVITA,
          size,
          openaiQuality: (qualitaApplicata as "low" | "medium" | "high" | undefined) ?? undefined,
          timeoutMs: 90_000,
          maxRetries: 1, // il worker ha una finestra breve: meglio fallire e ritentare al tick dopo
          metadata: { task_kind: "silvio_creativita_image", company_id: job.company_id, session_id: job.id },
        });
        const b64 = gen.imageDataUrl.split(",")[1] ?? "";
        if (!b64) throw new Error("nessuna immagine dal provider");

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

        // Addebito nel ledger AI centrale. Best-effort DOPO la consegna, come
        // ai-ads-image-generate: l'immagine è già pronta, un errore di charge
        // non deve negarla all'utente — ma va loggato, non ingoiato.
        // Costo reale da OpenRouter quando disponibile, altrimenti stima listino.
        const costRealUsd = gen.costUsd ?? costoImmagineUsd({ model: gen.modelUsed, size, quality: "standard" });
        try {
          await chargeDirectAiCall({
            supabase: admin,
            // job.id è la chiave naturale: un riprocessamento dello stesso job
            // non genera un secondo addebito (UNIQUE su idempotency_key).
            idempotencyKey: `silvio-creativita:${job.id}`,
            companyId: job.company_id,
            userId: job.created_by ?? null,
            taskKey: "silvio_creativita_image",
            tierKey: "t2_vision",
            modelUsed: gen.modelUsed,
            tokensIn: 0,
            tokensOut: 0,
            costRealUsd,
            durationMs: Date.now() - t0,
            metadata: { job_id: job.id, formato: job.formato, size },
          });
        } catch (chargeErr) {
          console.error(`[gen-worker] charge fallito per job ${job.id} (immagine già consegnata):`, chargeErr);
        }

        await admin.from("silvio_generation_jobs").update({
          status: "ready", public_url: pub.publicUrl,
          result: {
            file: fileName,
            size,
            // Il compositore lato client usa questi campi per portare l'immagine
            // al formato social reale (gpt-image-1 non genera 9:16 nativo).
            richiede_ritaglio: richiedeRitaglio((job.formato ?? "4:5") as CreativeAspect),
            costo_usd: costRealUsd,
            provider: gen.providerUsed,
            modello: gen.modelUsed,
          },
          updated_at: new Date().toISOString(),
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

    return jsonResponse({ ok: true, processed, failed, skipped, blocked, stale_failed: staleFailed, orphan_failed: orphanFailed, claimed_candidates: (candidates ?? []).length }, 200, cors);
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[gen-worker] fatal", msg);
    return errorResponse(`Fatal: ${msg}`, 500, cors);
  }
});
