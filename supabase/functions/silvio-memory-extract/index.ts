/**
 * Edge Function: silvio-memory-extract
 *
 * Cron notturno: per ogni utente con conversazioni Silvio fresche, estrae
 *   1. Fatti strutturati persistenti (es. "preferenze pagamento", "banca principale")
 *      → ai_brain_facts
 *   2. Sintesi conversazione del periodo
 *      → ai_brain_chat_summaries
 *   3. Se sintesi rilevante → embedding + scope=company in ai_brain_documents
 *
 * Modalità:
 *   - POST { mode: 'all' } → batch tutti gli utenti con chat fresche (cron)
 *   - POST { mode: 'user', user_id, channel_id } → on-demand singolo utente
 *
 * Auth: solo service_role (chiamato da cron) o super_admin/owner per debug.
 */

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { isInternalRequest, requireAuth, requireCompanyAccess, requireInternalSecret } from "../_shared/auth.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { generateEmbedding, contentHash } from "../_shared/brainEmbed.ts";
import { chargeDirectAiCall, estimateEmbeddingUsage } from "../_shared/directAiLedger.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface ExtractPayload {
  mode?: "all" | "user";
  user_id?: string;
  channel_id?: string;
  lookback_hours?: number;
}

interface ChatRow {
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

interface MemoryQueueRow {
  user_id: string;
  company_id: string;
  channel_id: string;
  messages_count: number | string | null;
}

interface FactsResponse {
  facts: Array<{ key: string; value: unknown; confidence: number; reason?: string }>;
  summary: string;
  topics: string[];
  key_decisions: string[];
}

const EXTRACT_SYSTEM_PROMPT = `Sei un assistente che ANALIZZA conversazioni tra un imprenditore edile e il suo AI assistant Silvio.

Il tuo compito: estrarre FATTI persistenti e una SINTESI della conversazione.

REGOLE:
1. Fatti devono essere PERSISTENTI nel tempo (preferenze, decisioni, contatti, regole aziendali) — NON eventi istantanei.
2. Ogni fatto ha key (snake_case), value (qualsiasi JSON), confidence (0-1).
3. Esempi di fatti BUONI:
   - { key: "banca_principale", value: "Intesa SanPaolo", confidence: 0.9 }
   - { key: "metodo_pagamento_preferito", value: "bonifico_60gg", confidence: 0.85 }
   - { key: "non_lavorare_con", value: ["Cliente X"], confidence: 0.95 }
   - { key: "operai_assegnati_ad_admin", value: { "Mario Rossi": "Roma" }, confidence: 0.7 }
4. Esempi di fatti CATTIVI:
   - { key: "ho_chiesto_oggi", value: "..." } (non persistente)
   - { key: "saluto", value: "ciao" } (irrilevante)
5. Confidence: 0.95+ se ESPLICITO ("la mia banca è X"); 0.7-0.9 se IMPLICITO; <0.7 NON estrarre.
6. Sintesi: 2-3 frasi che riassumono la conversazione (200 char max).
7. Topics: 3-5 keywords (es. ["fatturazione", "DURC", "fornitori"]).
8. Key decisions: bullet di decisioni prese (max 5).

OUTPUT RIGOROSO JSON (no markdown, no commenti):
{
  "facts": [{"key": "...", "value": ..., "confidence": 0.X, "reason": "..."}],
  "summary": "...",
  "topics": ["..."],
  "key_decisions": ["..."]
}

Se la conversazione non ha fatti rilevanti: facts: [], ma summary e topics SEMPRE compilati.`;

// ─────────────────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405, corsHeaders);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = createClient(supabaseUrl, serviceKey);

    const body = (await req.json().catch(() => ({}))) as ExtractPayload;
    const mode = body.mode ?? "all";
    const lookbackHours = body.lookback_hours ?? 24;
    let restrictedCompanyId: string | null = null;

    let targets: Array<{ user_id: string; company_id: string; channel_id: string; messages_count: number }> = [];

    if (mode === "user" && body.user_id && body.channel_id) {
      const { data: profile } = await supabase
        .from("profiles").select("company_id").eq("id", body.user_id).maybeSingle();
      if (profile?.company_id) {
        const auth = await requireAuth(req, corsHeaders);
        await requireCompanyAccess(supabase, auth.userId, profile.company_id, corsHeaders, {
          allowedRoles: ["super_admin", "company_admin"],
        });
        targets.push({
          user_id: body.user_id,
          company_id: profile.company_id,
          channel_id: body.channel_id,
          messages_count: 0, // not relevant, force run
        });
      }
    } else {
      if (isInternalRequest(req)) {
        requireInternalSecret(req, corsHeaders);
      } else {
        const auth = await requireAuth(req, corsHeaders);
        const { data: callerProfile } = await supabase
          .from("profiles")
          .select("company_id")
          .eq("id", auth.userId)
          .maybeSingle();
        if (!callerProfile?.company_id) {
          return errorResponse("Utente senza azienda", 403, corsHeaders);
        }
        const access = await requireCompanyAccess(supabase, auth.userId, callerProfile.company_id, corsHeaders, {
          allowedRoles: ["super_admin", "company_admin"],
        });
        if (!access.isSuperAdmin) restrictedCompanyId = access.companyId;
      }

      const { data: queue } = await supabase.rpc("silvio_users_needing_memory_extract", {
        p_lookback_hours: lookbackHours,
        p_min_messages: body.mode === "user" ? 1 : 4,
      });
      targets = ((queue ?? []) as MemoryQueueRow[])
        .filter((q) => !restrictedCompanyId || q.company_id === restrictedCompanyId)
        .map((q) => ({
          user_id: q.user_id,
          company_id: q.company_id,
          channel_id: q.channel_id,
          messages_count: Number(q.messages_count),
        }));
    }

    if (targets.length === 0) {
      return jsonResponse({ ok: true, processed: 0, message: "Nessun target" }, 200, corsHeaders);
    }

    let processed = 0;
    let factsTotal = 0;
    const errors: string[] = [];

    for (const t of targets) {
      try {
        const result = await processUser(supabase, t, lookbackHours);
        processed++;
        factsTotal += result.facts_added;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`${t.user_id}: ${msg}`);
        console.error(`[silvio-memory-extract] user ${t.user_id} failed:`, msg);
      }
    }

    return jsonResponse({
      ok: true,
      total_targets: targets.length,
      processed,
      facts_added_total: factsTotal,
      errors: errors.slice(0, 5),
      errors_count: errors.length,
    }, 200, corsHeaders);
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[silvio-memory-extract] error:", msg);
    return errorResponse(msg, 500, corsHeaders);
  }
});

// ─────────────────────────────────────────────────────────────────────────────

async function processUser(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  target: { user_id: string; company_id: string; channel_id: string },
  lookbackHours: number,
): Promise<{ facts_added: number; summary_id?: string }> {
  // 1) Carica chat
  const { data: chatRows } = await supabase.rpc("silvio_get_chat_for_extraction", {
    p_user_id: target.user_id,
    p_channel_id: target.channel_id,
    p_lookback_hours: lookbackHours,
  });
  const messages: ChatRow[] = (chatRows ?? []) as ChatRow[];

  if (messages.length < 2) {
    await supabase.rpc("silvio_mark_memory_extracted", {
      p_user_id: target.user_id,
      p_company_id: target.company_id,
      p_facts_added: 0,
    });
    return { facts_added: 0 };
  }

  // 2) Costruisci prompt LLM
  const transcript = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");
  const userPrompt = `CONVERSAZIONE da analizzare (${messages.length} messaggi):\n\n${transcript.slice(0, 12000)}\n\nEstrai facts + summary + topics + key_decisions in JSON.`;

  // 3) LLM call (cheap model)
  let extracted: FactsResponse;
  try {
    const result = await aiRouterComplete({
      supabase,
      taskKey: "memory_extraction",
      messages: [
        { role: "system", content: EXTRACT_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      params: { temperature: 0.2, max_tokens: 1500 },
      responseFormat: { type: "json_object" },
      companyId: target.company_id,
      userId: target.user_id,
      personaKey: "silvio",
      idempotencyKey: `memory_${target.user_id}_${new Date().toISOString().slice(0, 10)}`,
    });
    extracted = JSON.parse(result.content);
  } catch (e) {
    console.warn(`[silvio-memory] extraction LLM failed for ${target.user_id}:`, e);
    await supabase.rpc("silvio_mark_memory_extracted", {
      p_user_id: target.user_id,
      p_company_id: target.company_id,
      p_facts_added: 0,
    });
    return { facts_added: 0 };
  }

  // 4) Salva facts
  let factsAdded = 0;
  for (const fact of extracted.facts ?? []) {
    if (!fact.key || fact.confidence < 0.7) continue;
    try {
      await supabase.rpc("brain_record_fact", {
        p_company_id: target.company_id,
        p_fact_key: fact.key,
        p_fact_value: fact.value,
        p_source: "auto_chat",
        p_source_user_id: target.user_id,
        p_confidence: fact.confidence,
        p_notes: fact.reason ?? null,
      });
      factsAdded++;
    } catch (e) {
      console.warn(`[silvio-memory] fact ${fact.key} failed:`, e);
    }
  }

  // 5) Genera embedding del summary + salva chat_summary
  const summaryText = extracted.summary || "Conversazione recente con Silvio";
  let summaryEmbedding: number[] | null = null;
  const periodEnd = new Date().toISOString().slice(0, 10);
  const periodStart = new Date(Date.now() - lookbackHours * 3600 * 1000).toISOString().slice(0, 10);
  try {
    summaryEmbedding = await generateEmbedding(summaryText);
    const embeddingUsage = estimateEmbeddingUsage(summaryText);
    const summaryHash = await contentHash(summaryText);
    await chargeDirectAiCall({
      supabase,
      idempotencyKey: `memory_summary_embedding_${target.company_id}_${target.user_id}_${target.channel_id}_${periodEnd}_${summaryHash.slice(0, 16)}`,
      companyId: target.company_id,
      userId: target.user_id,
      taskKey: "memory_summary_embedding",
      tierKey: "t1_economic",
      modelUsed: "text-embedding-3-small",
      personaKey: "silvio",
      tokensIn: embeddingUsage.tokens,
      tokensOut: 0,
      costRealUsd: embeddingUsage.costUsd,
      metadata: {
        source: "silvio_memory_extract",
        channel_id: target.channel_id,
        period_start: periodStart,
        period_end: periodEnd,
        facts_added: factsAdded,
      },
    });
  } catch (e) {
    console.warn("[silvio-memory] embed/ledger summary failed:", e);
    summaryEmbedding = null;
  }

  let summaryId: string | undefined;
  try {
    const { data: id } = await supabase.rpc("silvio_record_memory_summary", {
      p_company_id: target.company_id,
      p_user_id: target.user_id,
      p_session_id: null,
      p_channel_id: target.channel_id,
      p_period_start: periodStart,
      p_period_end: periodEnd,
      p_summary: summaryText,
      p_topics: extracted.topics ?? [],
      p_key_facts: extracted.key_decisions ?? [],
      p_messages_count: messages.length,
      p_embedding: summaryEmbedding ? `[${summaryEmbedding.join(",")}]` : null,
    });
    summaryId = id as string;
  } catch (e) {
    console.warn("[silvio-memory] save summary failed:", e);
  }

  // 6) Promuovi summary in ai_brain_documents (scope=company) per RAG
  if (summaryEmbedding && extracted.facts.length > 0) {
    try {
      const promoteContent = `[Sintesi conversazione ${periodEnd}] ${summaryText}\n\nDecisioni: ${(extracted.key_decisions ?? []).join("; ")}`;
      const promoteHash = await contentHash(promoteContent);
      await supabase.rpc("brain_upsert_document", {
        p_company_id: target.company_id,
        p_source_type: "chat_summary",
        p_source_id: null,
        p_content: promoteContent,
        p_content_hash: promoteHash,
        p_embedding: `[${summaryEmbedding.join(",")}]`,
        p_metadata: {
          user_id: target.user_id,
          period_end: periodEnd,
          topics: extracted.topics,
          messages_count: messages.length,
        },
        p_visibility_roles: null,
        p_scope: "company",
        p_category: null,
        p_title: `Sintesi chat ${periodEnd}`,
      });
    } catch (e) {
      console.warn("[silvio-memory] promote to brain failed:", e);
    }
  }

  // 7) Mark extracted
  await supabase.rpc("silvio_mark_memory_extracted", {
    p_user_id: target.user_id,
    p_company_id: target.company_id,
    p_facts_added: factsAdded,
  });

  return { facts_added: factsAdded, summary_id: summaryId };
}
