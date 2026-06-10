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
import { gateAiPayment } from "../_shared/requirePaymentMethod.ts";
import { generateEmbeddingsBatch, contentHash, chunkTextSliding } from "../_shared/brainEmbed.ts";
import { buildStableAiIdempotencyKey, chargeDirectAiCall, estimateEmbeddingUsage } from "../_shared/directAiLedger.ts";

interface IngestItem {
  source_type: string;
  source_id?: string | null;
  content: string;
  metadata?: Record<string, unknown>;
  visibility_roles?: string[];
  scope?: "company" | "universal";
  category?: string | null;
  title?: string | null;
}

interface BackfillSource {
  source_type: string;
  table: string;
  build: string; // SQL expression che produce content text
  metadata?: string; // SQL expression per metadata jsonb
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_CHUNKS_PER_REQUEST = 1000;

function normalizeUuid(value?: string | null): string | null {
  const clean = String(value ?? "").trim();
  return UUID_RE.test(clean) ? clean : null;
}

function normalizeText(value: unknown): string | null {
  const clean = typeof value === "string" ? value.trim() : "";
  return clean.length > 0 ? clean : null;
}

function normalizeMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? { ...metadata } : {};
}

function normalizeScope(item: IngestItem): "company" | "universal" {
  const metadataScope = normalizeText(item.metadata?.scope);
  return item.scope === "universal" || metadataScope === "universal" ? "universal" : "company";
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
    const access = await requireCompanyAccess(supabaseAdmin, userId, companyId, corsHeaders);

    // Gate carta (audit AI 2026-06): strumento a costo senza controllo pagamento.
    const paymentBlock = await gateAiPayment(supabaseAdmin, companyId, corsHeaders);
    if (paymentBlock) return paymentBlock;

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

        try {
          if (srcKey === "customer") {
            const { data, error } = await supabaseAdmin
              .from("orders")
              .select("id, customer_id, client_name, client_company, client_email, client_phone, client_address, indirizzo_lavori, work_address, status, total_amount, created_at")
              .eq("company_id", companyId)
              .limit(Math.min(limitPerSource * 4, 1000));

            if (error) {
              console.error("[brain-ingest] backfill customer error:", error.message);
              continue;
            }

            const seen = new Set<string>();
            for (const row of data ?? []) {
              const dedupeKey = String(
                row.customer_id ?? row.client_email ?? row.client_phone ?? row.client_company ?? row.client_name ?? row.id,
              ).trim().toLowerCase();
              if (!dedupeKey || seen.has(dedupeKey)) continue;
              seen.add(dedupeKey);

              const content = buildContentForSource("customer", row);
              if (!content || content.length < 20) continue;
              items.push({
                source_type: "customer",
                source_id: normalizeUuid(row.customer_id) ?? normalizeUuid(row.id),
                content,
                metadata: buildMetadataForSource("customer", row),
              });
              if (seen.size >= limitPerSource) break;
            }
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

    const hasUniversalScope = items.some((item) => normalizeScope(item) === "universal");
    if (hasUniversalScope && !access.isSuperAdmin) {
      return errorResponse("Forbidden: solo super_admin può scrivere nel Brain universale", 403, corsHeaders);
    }

    // ── Chunking + embedding ────────────────────────────────────────────
    const chunks: Array<IngestItem & { chunk: string; hash: string }> = [];
    for (const item of items) {
      const baseMetadata = normalizeMetadata(item.metadata);
      const itemChunks = chunkTextSliding(item.content);
      if (chunks.length + itemChunks.length > MAX_CHUNKS_PER_REQUEST) {
        return errorResponse(
          `Troppi contenuti da indicizzare in una singola richiesta (${chunks.length + itemChunks.length} chunk, max ${MAX_CHUNKS_PER_REQUEST}). Riduci il batch o usa un backfill più piccolo.`,
          413,
          corsHeaders,
        );
      }

      for (const chunk of itemChunks) {
        const content = chunk.content.trim();
        if (content.length < 5) continue;
        const hash = await contentHash(content);
        chunks.push({
          ...item,
          metadata: {
            ...baseMetadata,
            chunk_index: chunk.index,
            chunk_total: chunk.total,
          },
          chunk: content,
          hash,
        });
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
    const documentIds: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      const emb = embeddings[i];

      try {
        const normalizedSourceId = normalizeUuid(c.source_id);
        const metadata = normalizeMetadata(c.metadata);
        if (!normalizedSourceId && c.source_id) {
          metadata.original_source_id = c.source_id;
        }
        const scope = normalizeScope(c);
        const category = normalizeText(c.category ?? metadata.category);
        const title = normalizeText(c.title ?? metadata.title);
        // RPC expects vector as PostgreSQL literal string '[v1,v2,...]'.
        const { data: documentId, error: rpcErr } = await supabaseAdmin.rpc("brain_upsert_document", {
          p_company_id: scope === "universal" ? null : companyId,
          p_source_type: c.source_type,
          p_source_id: normalizedSourceId,
          p_content: c.chunk,
          p_content_hash: c.hash,
          p_embedding: emb ? `[${emb.join(",")}]` : null,
          p_metadata: metadata,
          p_visibility_roles: c.visibility_roles ?? null,
          p_scope: scope,
          p_category: category,
          p_title: title,
        });
        if (rpcErr) { failCount++; console.error("[brain-ingest] upsert error:", rpcErr.message); }
        else {
          okCount++;
          if (typeof documentId === "string") documentIds.push(documentId);
        }
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
      document_ids: Array.from(new Set(documentIds)),
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

    case "customer":
      return [
        `CLIENTE: ${row.client_name ?? row.client_company ?? ""}`,
        `AZIENDA: ${row.client_company ?? ""}`,
        `EMAIL: ${row.client_email ?? ""}`,
        `TELEFONO: ${row.client_phone ?? ""}`,
        `INDIRIZZO CLIENTE: ${row.client_address ?? ""}`,
        `INDIRIZZO LAVORO: ${row.indirizzo_lavori ?? row.work_address ?? ""}`,
        `ULTIMO STATO COMMESSA: ${row.status ?? ""}`,
        `VALORE ULTIMA COMMESSA: € ${row.total_amount ?? 0}`,
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
    case "customer":
      return {
        cliente: row.client_name ?? row.client_company,
        azienda: row.client_company,
        email: row.client_email,
        phone: row.client_phone,
        ultima_commessa_status: row.status,
        ultima_commessa_valore_eur: row.total_amount,
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
