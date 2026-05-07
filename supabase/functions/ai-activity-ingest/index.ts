/**
 * Edge Function: ai-activity-ingest
 *
 * Sessione 2 / MP-06 — Activity Brain ingest pipeline.
 * Pesca righe recenti da `company_activity_log` e le indicizza nel Brain RAG
 * (`ai_brain_documents`) come document type `activity`. Così Silvio può fare
 * RAG semantico sull'attività azienda (oltre alla ricerca strutturata via
 * tool `query_activity`).
 *
 * Modalità di invocazione:
 *   1. POST { mode: "ingest", company_id, since_iso?, limit? }
 *      → indicizza ultime N righe non ancora ingestate (brain_doc_id NULL)
 *   2. POST { mode: "ingest_one", activity_id }
 *      → indicizza una singola riga (chiamata da trigger via pg_net o webhook)
 *   3. POST { mode: "backfill", company_id, days?: 30 }
 *      → riempie storico fino a N giorni indietro
 *
 * Idempotente: usa content_hash → upsert. Non duplica se già indicizzata.
 * Tutto auto-scoped al company_id del chiamante (via JWT).
 */

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { generateEmbeddingsBatch, contentHash } from "../_shared/brainEmbed.ts";
import { chargeDirectAiCall, estimateEmbeddingUsage } from "../_shared/directAiLedger.ts";

interface IngestRequest {
  mode?: "ingest" | "ingest_one" | "backfill";
  company_id?: string;
  activity_id?: string;
  since_iso?: string;
  days?: number;
  limit?: number;
}

interface ActivityRow {
  id: string;
  company_id: string;
  created_at: string;
  category: string | null;
  event_type: string | null;
  importance: string | null;
  actor_user_id: string | null;
  actor_name: string | null;
  target_table: string | null;
  target_id: string | null;
  target_label: string | null;
  description: string | null;
  changes: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
}

const MAX_BATCH = 50;
const SOURCE_TYPE = "activity";

/**
 * Trasforma una riga di company_activity_log in testo embed-able compatto.
 * Vogliamo testo denso ma leggibile, no JSON grezzo (gli embedder funzionano
 * meglio con prosa). Include keyword strutturali per filtri downstream.
 */
function activityToText(row: ActivityRow): string {
  const parts: string[] = [];
  parts.push(`[${row.event_type ?? "event"}] ${row.description ?? ""}`.trim());

  if (row.target_table) {
    parts.push(`Tabella: ${row.target_table}${row.target_label ? ` — ${row.target_label}` : ""}`);
  }
  if (row.actor_name) parts.push(`Attore: ${row.actor_name}`);
  if (row.importance && row.importance !== "normal") {
    parts.push(`Importanza: ${row.importance.toUpperCase()}`);
  }
  if (row.category) parts.push(`Categoria: ${row.category}`);

  // Cambi più rilevanti (max 5 per evitare bloat)
  if (row.changes && typeof row.changes === "object") {
    const entries = Object.entries(row.changes).slice(0, 5);
    if (entries.length > 0) {
      const summary = entries
        .map(([k, v]) => {
          const oldV = (v as { old?: unknown })?.old;
          const newV = (v as { new?: unknown })?.new;
          const fmt = (x: unknown) =>
            x === null || x === undefined
              ? "—"
              : typeof x === "object"
                ? JSON.stringify(x).slice(0, 60)
                : String(x).slice(0, 60);
          return `${k}: ${fmt(oldV)} → ${fmt(newV)}`;
        })
        .join("; ");
      parts.push(`Modifiche: ${summary}`);
    }
  }

  parts.push(`Data: ${row.created_at}`);
  return parts.filter(Boolean).join(" | ");
}

async function ingestRows(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  rows: ActivityRow[],
  userId: string,
): Promise<{ ingested: number; skipped: number; errors: number }> {
  if (rows.length === 0) return { ingested: 0, skipped: 0, errors: 0 };

  const texts = rows.map(activityToText);
  let embeddings: number[][];
  try {
    embeddings = await generateEmbeddingsBatch(texts);
  } catch (e) {
    console.error("[ai-activity-ingest] embedding batch failed:", e instanceof Error ? e.message : e);
    return { ingested: 0, skipped: 0, errors: rows.length };
  }
  if (embeddings.length !== rows.length) {
    console.warn("[ai-activity-ingest] embeddings length mismatch", embeddings.length, rows.length);
    return { ingested: 0, skipped: 0, errors: rows.length };
  }

  // Charge embedding cost (best-effort, non bloccante)
  try {
    const usage = estimateEmbeddingUsage(texts.join("\n"));
    await chargeDirectAiCall({
      supabase,
      idempotencyKey: `activity_ingest_${rows[0].company_id}_${rows[0].id}_${Date.now()}`,
      companyId: rows[0].company_id,
      userId,
      taskKey: "activity_ingest_embedding",
      tierKey: "t1_economic",
      modelUsed: "text-embedding-3-small",
      personaKey: null,
      tokensIn: usage.tokens,
      tokensOut: 0,
      costRealUsd: usage.costUsd,
      metadata: { source: "ai_activity_ingest", rows: rows.length },
    });
  } catch (e) {
    console.warn("[ai-activity-ingest] charge fallita (non bloccante):", e instanceof Error ? e.message : e);
  }

  let ingested = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const text = texts[i];
    const embedding = embeddings[i];
    const hash = await contentHash(text);

    const { data: brainDoc, error: insErr } = await supabase
      .from("ai_brain_documents")
      .upsert(
        {
          company_id: row.company_id,
          source_type: SOURCE_TYPE,
          source_id: row.id,
          content: text,
          content_hash: hash,
          embedding: `[${embedding.join(",")}]`,
          scope: "company",
          metadata: {
            activity_id: row.id,
            event_type: row.event_type,
            category: row.category,
            importance: row.importance,
            target_table: row.target_table,
            target_id: row.target_id,
            target_label: row.target_label,
            actor_user_id: row.actor_user_id,
            actor_name: row.actor_name,
            occurred_at: row.created_at,
          },
        },
        { onConflict: "content_hash" },
      )
      .select("id")
      .single();

    if (insErr || !brainDoc) {
      console.warn("[ai-activity-ingest] upsert ai_brain_documents fallito:", insErr?.message);
      errors++;
      continue;
    }

    // Backlink: salva brain_doc_id sull'activity log
    const { error: updErr } = await supabase
      .from("company_activity_log")
      .update({ brain_doc_id: brainDoc.id })
      .eq("id", row.id);
    if (updErr) {
      console.warn("[ai-activity-ingest] backlink fallito:", updErr.message);
    }

    ingested++;
  }

  return { ingested, skipped: 0, errors };
}

serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return errorResponse("POST only", 405, cors);

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, cors);
    const body = (await req.json().catch(() => ({}))) as IngestRequest;
    const mode = body.mode ?? "ingest";

    if (mode === "ingest_one") {
      if (!body.activity_id) return errorResponse("activity_id required", 400, cors);
      const { data: row, error } = await supabaseAdmin
        .from("company_activity_log")
        .select("id, company_id, created_at, category, event_type, importance, actor_user_id, actor_name, target_table, target_id, target_label, description, changes, metadata, brain_doc_id")
        .eq("id", body.activity_id)
        .single();
      if (error || !row) return errorResponse(`activity not found: ${error?.message}`, 404, cors);
      await requireCompanyAccess(supabaseAdmin, userId, row.company_id, cors);
      if (row.brain_doc_id) {
        return jsonResponse({ already_ingested: true, brain_doc_id: row.brain_doc_id }, 200, cors);
      }
      const result = await ingestRows(supabaseAdmin, [row as ActivityRow], userId);
      return jsonResponse({ mode: "ingest_one", ...result }, 200, cors);
    }

    if (!body.company_id) return errorResponse("company_id required", 400, cors);
    await requireCompanyAccess(supabaseAdmin, userId, body.company_id, cors);

    const limit = Math.min(Math.max(body.limit ?? 25, 1), MAX_BATCH);

    let sinceIso: string;
    if (mode === "backfill") {
      const days = Math.min(Math.max(body.days ?? 30, 1), 365);
      sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    } else {
      sinceIso = body.since_iso ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    }

    // Pesca righe non ancora indicizzate (brain_doc_id NULL) della company
    const { data: rows, error: qErr } = await supabaseAdmin
      .from("company_activity_log")
      .select("id, company_id, created_at, category, event_type, importance, actor_user_id, actor_name, target_table, target_id, target_label, description, changes, metadata")
      .eq("company_id", body.company_id)
      .is("brain_doc_id", null)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (qErr) return errorResponse(qErr.message, 500, cors);

    const result = await ingestRows(supabaseAdmin, (rows ?? []) as ActivityRow[], userId);
    return jsonResponse({
      mode,
      since_iso: sinceIso,
      candidates: rows?.length ?? 0,
      ...result,
    }, 200, cors);
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(err instanceof Error ? err.message : String(err), 500, getCorsHeaders(req));
  }
});
