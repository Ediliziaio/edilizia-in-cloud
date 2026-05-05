/**
 * Edge Function: ai-brain-ingest
 *
 * Ingesta documenti aziendali nel Brain RAG (ai_brain_documents):
 *   - Chunking semantico (max 2000 char per chunk)
 *   - Embedding via OpenAI text-embedding-3-small
 *   - Upsert idempotente (content_hash dedup)
 *
 * Modalità:
 *   1. POST con body { items: [{source_type, source_id, content, metadata?}] }
 *      → ingest manuale di items specifici
 *   2. POST con body { mode: "backfill", source_types: ["order","customer",...] }
 *      → backfill automatico da tabelle business
 *
 * Tutti gli ingest sono auto-scoped al company_id del chiamante.
 */

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { generateEmbeddingsBatch, contentHash, chunkText } from "../_shared/brainEmbed.ts";
import { buildStableAiIdempotencyKey, chargeDirectAiCall, estimateEmbeddingUsage } from "../_shared/directAiLedger.ts";

interface IngestItem {
  source_type: string;
  source_id?: string | null;
  content: string;
  metadata?: Record<string, unknown>;
  visibility_roles?: string[];
}

interface BackfillSource {
  source_type: string;
  table: string;
  build: string; // SQL expression che produce content text
  metadata?: string; // SQL expression per metadata jsonb
}

const BACKFILL_SOURCES: Record<string, BackfillSource> = {
  order: {
    source_type: "order",
    table: "orders",
    build: `concat_ws(E'\\n',
      'COMMESSA: ' || COALESCE(order_code, ''),
      'CLIENTE: ' || COALESCE(client_name, client_company, ''),
      'TIPO LAVORO: ' || COALESCE(tipo_lavoro, ''),
      'INDIRIZZO: ' || COALESCE(indirizzo_lavori, work_address, ''),
      'DESCRIZIONE: ' || COALESCE(work_description, description, ''),
      'NOTE: ' || COALESCE(internal_notes, '')
    )`,
    metadata: `jsonb_build_object('order_code', order_code, 'cliente', COALESCE(client_name, client_company), 'valore_eur', total_amount, 'status', status)`,
  },
  customer: {
    source_type: "customer",
    table: "(SELECT DISTINCT ON (COALESCE(client_name, client_company)) id, COALESCE(client_name, client_company) AS nome_cliente, client_email, client_phone, client_address, client_company, company_id FROM orders) c",
    build: `concat_ws(E'\\n',
      'CLIENTE: ' || COALESCE(nome_cliente, ''),
      'EMAIL: ' || COALESCE(client_email, ''),
      'TELEFONO: ' || COALESCE(client_phone, ''),
      'INDIRIZZO: ' || COALESCE(client_address, ''),
      'AZIENDA: ' || COALESCE(client_company, '')
    )`,
    metadata: `jsonb_build_object('nome', nome_cliente, 'email', client_email)`,
  },
  quote: {
    source_type: "quote",
    table: "quotes",
    build: `concat_ws(E'\\n',
      'PREVENTIVO: ' || COALESCE(quote_number, ''),
      'CLIENTE: ' || COALESCE(client_name, ''),
      'STATO: ' || COALESCE(status, ''),
      'VALORE: ' || COALESCE(total::text, ''),
      'NOTE: ' || COALESCE(notes, '')
    )`,
    metadata: `jsonb_build_object('quote_number', quote_number, 'cliente', client_name, 'valore_eur', total, 'status', status)`,
  },
  supplier: {
    source_type: "supplier",
    table: "suppliers",
    build: `concat_ws(E'\\n',
      'FORNITORE: ' || COALESCE(name, ''),
      'CATEGORIA: ' || COALESCE(product_category, ''),
      'EMAIL: ' || COALESCE(email, ''),
      'TELEFONO: ' || COALESCE(phone, ''),
      'CITTÀ: ' || COALESCE(city, ''),
      'NOTE: ' || COALESCE(notes, '')
    )`,
    metadata: `jsonb_build_object('nome', name, 'categoria', product_category, 'email', email)`,
  },
  subappaltatore: {
    source_type: "subappaltatore",
    table: "subappaltatori",
    build: `concat_ws(E'\\n',
      'SUBAPPALTATORE: ' || COALESCE(ragione_sociale, ''),
      'RESPONSABILE: ' || COALESCE(responsabile, ''),
      'EMAIL: ' || COALESCE(email, ''),
      'TELEFONO: ' || COALESCE(telefono, ''),
      'P.IVA: ' || COALESCE(piva, ''),
      'NOTE: ' || COALESCE(notes, '')
    )`,
    metadata: `jsonb_build_object('nome', ragione_sociale, 'piva', piva)`,
  },
};

// ─────────────────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405, corsHeaders);

  try {
    const auth = await requireAuth(req, corsHeaders);
    const userId = auth.userId;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabaseAdmin = auth.supabaseAdmin as any;

    // Resolve company
    const { data: profile } = await supabaseAdmin
      .from("profiles").select("company_id").eq("id", userId).maybeSingle();
    const companyId: string | null = profile?.company_id ?? null;
    if (!companyId) return errorResponse("Nessuna azienda associata", 400, corsHeaders);
    await requireCompanyAccess(supabaseAdmin, userId, companyId, corsHeaders);

    const body = await req.json();
    const mode = body?.mode ?? "items";

    let items: IngestItem[] = [];

    // ── Backfill mode: estrai da tabelle business ───────────────────────
    if (mode === "backfill") {
      const requestedSources: string[] = body?.source_types ?? Object.keys(BACKFILL_SOURCES);
      const limitPerSource: number = Math.min(body?.limit_per_source ?? 200, 500);

      for (const srcKey of requestedSources) {
        const cfg = BACKFILL_SOURCES[srcKey];
        if (!cfg) {
          console.warn(`[brain-ingest] source sconosciuto: ${srcKey}`);
          continue;
        }

        // Build query dinamica
        const sql = `
          SELECT
            ${cfg.table.includes("(SELECT") ? "id" : "id"} AS row_id,
            ${cfg.build} AS content,
            ${cfg.metadata ?? "'{}'::jsonb"} AS metadata
          FROM public.${cfg.table.includes("(SELECT") ? cfg.table : cfg.table}
          WHERE company_id = $1
          LIMIT $2
        `;

        try {
          // Use raw query via RPC wrapper (postgrest direct)
          // Workaround: define inline a small helper that does this safely is complex.
          // Use direct SQL via supabase-js .rpc('exec_sql', ...) — but we need to define one.
          // Per ora: limito i tipi a quelli con tabella diretta e uso .from() + .select.
          if (cfg.table.includes("(SELECT")) {
            // skip dynamic subquery sources for now (customer would require service-level access)
            // We can implement this via a dedicated SQL fn later.
            continue;
          }

          const { data, error } = await supabaseAdmin
            .from(cfg.table)
            .select("*")
            .eq("company_id", companyId)
            .limit(limitPerSource);

          if (error) {
            console.error(`[brain-ingest] backfill ${srcKey} error:`, error.message);
            continue;
          }

          // Costruisci items in TS (no SQL build) per evitare iniezioni
          for (const row of data ?? []) {
            const content = buildContentForSource(srcKey, row);
            if (!content || content.length < 20) continue;
            const metadata = buildMetadataForSource(srcKey, row);
            items.push({
              source_type: cfg.source_type,
              source_id: row.id ?? null,
              content,
              metadata,
            });
          }
        } catch (e) {
          console.error(`[brain-ingest] backfill ${srcKey} exception:`, e);
        }
      }
    } else {
      items = (body?.items ?? []) as IngestItem[];
    }

    if (!Array.isArray(items) || items.length === 0) {
      return jsonResponse({ ok: true, ingested: 0, message: "Nessun item da ingestare" }, 200, corsHeaders);
    }

    // ── Chunking + embedding ────────────────────────────────────────────
    const chunks: Array<IngestItem & { chunk: string; hash: string }> = [];
    for (const item of items) {
      for (const chunk of chunkText(item.content)) {
        const hash = await contentHash(chunk);
        chunks.push({ ...item, chunk, hash });
      }
    }

    if (chunks.length === 0) {
      return jsonResponse({ ok: true, ingested: 0, message: "Nessun chunk valido" }, 200, corsHeaders);
    }

    let embeddings: number[][] = [];
    try {
      const embeddingInputs = chunks.map(c => c.chunk);
      embeddings = await generateEmbeddingsBatch(embeddingInputs);
      const embeddingUsage = estimateEmbeddingUsage(embeddingInputs);
      await chargeDirectAiCall({
        supabase: supabaseAdmin,
        idempotencyKey: await buildStableAiIdempotencyKey("brain_ingest_embedding", [
          companyId,
          userId,
          mode,
          chunks.map((chunk) => chunk.hash),
        ]),
        companyId,
        userId,
        taskKey: "brain_ingest_embedding",
        tierKey: "t1_economic",
        modelUsed: "text-embedding-3-small",
        tokensIn: embeddingUsage.tokens,
        costRealUsd: embeddingUsage.costUsd,
        metadata: {
          mode,
          chunks: chunks.length,
          source_types: Array.from(new Set(chunks.map((c) => c.source_type))),
        },
      });
    } catch (embErr) {
      console.error("[brain-ingest] embedding error:", embErr);
      return errorResponse(`Errore embedding/ledger: ${embErr instanceof Error ? embErr.message : String(embErr)}`, 502, corsHeaders);
    }

    // ── Upsert via RPC ──────────────────────────────────────────────────
    let okCount = 0;
    let failCount = 0;
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      const emb = embeddings[i];

      try {
        // RPC expects vector as PostgreSQL literal string '[v1,v2,...]'
        // Supabase JS converts arrays to vector when passed as array
        const { error: rpcErr } = await supabaseAdmin.rpc("brain_upsert_document", {
          p_company_id: companyId,
          p_source_type: c.source_type,
          p_source_id: c.source_id ?? null,
          p_content: c.chunk,
          p_content_hash: c.hash,
          p_embedding: emb ? `[${emb.join(",")}]` : null,
          p_metadata: c.metadata ?? {},
          p_visibility_roles: c.visibility_roles ?? null,
        });
        if (rpcErr) { failCount++; console.error("[brain-ingest] upsert error:", rpcErr.message); }
        else okCount++;
      } catch (e) {
        failCount++;
        console.error("[brain-ingest] upsert exception:", e);
      }
    }

    // Stats post-ingest
    const { data: stats } = await supabaseAdmin.rpc("brain_stats", { p_company_id: companyId });

    return jsonResponse({
      ok: true,
      ingested: okCount,
      failed: failCount,
      total_chunks: chunks.length,
      embedded: embeddings.length,
      stats,
    }, 200, corsHeaders);

  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ai-brain-ingest] error:", msg);
    return errorResponse(msg, 500, corsHeaders);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Content builders per source (nessuna SQL injection — TS pure)
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildContentForSource(src: string, row: any): string {
  switch (src) {
    case "order":
      return [
        `COMMESSA: ${row.order_code ?? ""}`,
        `CLIENTE: ${row.client_name ?? row.client_company ?? ""}`,
        `TIPO LAVORO: ${row.tipo_lavoro ?? ""}`,
        `INDIRIZZO: ${row.indirizzo_lavori ?? row.work_address ?? ""}`,
        `DESCRIZIONE: ${row.work_description ?? row.description ?? ""}`,
        `VALORE: € ${row.total_amount ?? 0}`,
        `STATO: ${row.status ?? ""}`,
        `NOTE: ${row.internal_notes ?? ""}`,
      ].filter(s => s.split(": ")[1]?.trim()).join("\n");

    case "quote":
      return [
        `PREVENTIVO: ${row.quote_number ?? ""}`,
        `CLIENTE: ${row.client_name ?? ""}`,
        `STATO: ${row.status ?? ""}`,
        `VALORE: € ${row.total ?? 0}`,
        `NOTE: ${row.notes ?? ""}`,
      ].filter(s => s.split(": ")[1]?.trim()).join("\n");

    case "supplier":
      return [
        `FORNITORE: ${row.name ?? ""}`,
        `CATEGORIA: ${row.product_category ?? ""}`,
        `EMAIL: ${row.email ?? ""}`,
        `TELEFONO: ${row.phone ?? ""}`,
        `CITTÀ: ${row.city ?? ""}`,
        `PAGAMENTO: ${row.payment_method ?? ""}`,
        `LEAD TIME: ${row.lead_time_days ?? ""} gg`,
        `NOTE: ${row.notes ?? ""}`,
      ].filter(s => s.split(": ")[1]?.trim()).join("\n");

    case "subappaltatore":
      return [
        `SUBAPPALTATORE: ${row.ragione_sociale ?? ""}`,
        `RESPONSABILE: ${row.responsabile ?? ""}`,
        `EMAIL: ${row.email ?? ""}`,
        `TELEFONO: ${row.telefono ?? ""}`,
        `P.IVA: ${row.piva ?? ""}`,
        `NOTE: ${row.notes ?? ""}`,
      ].filter(s => s.split(": ")[1]?.trim()).join("\n");

    default:
      return "";
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildMetadataForSource(src: string, row: any): Record<string, unknown> {
  switch (src) {
    case "order":
      return {
        order_code: row.order_code,
        cliente: row.client_name ?? row.client_company,
        valore_eur: row.total_amount,
        status: row.status,
      };
    case "quote":
      return { quote_number: row.quote_number, cliente: row.client_name, valore_eur: row.total, status: row.status };
    case "supplier":
      return { nome: row.name, categoria: row.product_category, email: row.email };
    case "subappaltatore":
      return { nome: row.ragione_sociale, piva: row.piva };
    default:
      return {};
  }
}
