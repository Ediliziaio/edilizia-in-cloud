/**
 * entity-embed-batch — GAP 8b
 *
 * Genera/aggiorna embeddings pgvector per le entità del business
 * (clienti, ordini, fatture, opportunità, subappaltatori, fornitori).
 *
 * 2 modes:
 *   1. INGEST: scansiona le tabelle sorgente e marca dirty per (re)embed
 *      (use case: backfill iniziale o re-sync settimanale)
 *   2. PROCESS: prende le entries con is_dirty=true, genera embedding,
 *      salva. Idempotente.
 *
 * Body POST:
 *   { mode: "ingest" | "process", company_id?: uuid, entity_types?: string[],
 *     limit?: number, since?: string (ISO) }
 *
 * Auth: x-cron-secret (env PROACTIVE_CRON_SECRET) o service_role bearer.
 *
 * Costo stimato: text-embedding-3-small = $0.02/1M tokens input.
 * Per 1000 clienti con summary 100 token = 100k token = $0.002 totali.
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";

interface RequestBody {
  mode: "ingest" | "process";
  company_id?: string;
  entity_types?: string[];
  limit?: number;
  since?: string;
}

interface DirtyEntity {
  id: string;
  company_id: string;
  entity_type: string;
  entity_id: string;
  content: string;
}

const OPENAI_EMBED_URL = "https://api.openai.com/v1/embeddings";
const EMBED_MODEL = "text-embedding-3-small";

async function generateEmbedding(text: string): Promise<number[] | null> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return null;
  try {
    const res = await fetch(OPENAI_EMBED_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: EMBED_MODEL,
        input: text.substring(0, 8000),
      }),
    });
    if (!res.ok) return null;
    const json = await res.json() as { data?: Array<{ embedding: number[] }> };
    return json.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// INGEST: scansiona entità sorgente e marca dirty
// ════════════════════════════════════════════════════════════════════════════

async function buildCustomerSummary(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  c: any,
): Promise<{ content: string; metadata: Record<string, unknown> }> {
  const parts = [
    `Cliente: ${c.first_name ?? ""} ${c.last_name ?? ""}`.trim(),
    c.email ? `Email: ${c.email}` : null,
    c.phone ? `Tel: ${c.phone}` : null,
    c.city ? `Città: ${c.city}` : null,
    c.indirizzo ? `Indirizzo: ${c.indirizzo}` : null,
    c.note_pubbliche ? `Note: ${String(c.note_pubbliche).substring(0, 500)}` : null,
  ].filter(Boolean);
  return {
    content: parts.join(". "),
    metadata: {
      city: c.city ?? null,
      created_at: c.created_at ?? null,
    },
  };
}

async function buildOrderSummary(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  o: any,
): Promise<{ content: string; metadata: Record<string, unknown> }> {
  const parts = [
    `Cantiere: ${o.description ?? "—"}`,
    o.order_code ? `Codice: ${o.order_code}` : null,
    o.expected_date ? `Fine prevista: ${o.expected_date}` : null,
    o.total_amount ? `Importo: €${o.total_amount}` : null,
    o.internal_notes ? `Note: ${String(o.internal_notes).substring(0, 800)}` : null,
  ].filter(Boolean);
  return {
    content: parts.join(". "),
    metadata: {
      total_amount: o.total_amount ?? null,
      expected_date: o.expected_date ?? null,
      customer_id: o.customer_id ?? null,
    },
  };
}

async function buildInvoiceSummary(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  i: any,
): Promise<{ content: string; metadata: Record<string, unknown> }> {
  const parts = [
    `Fattura ${i.numero ?? "—"}`,
    i.data_emissione ? `del ${i.data_emissione}` : null,
    i.importo_totale ? `importo €${i.importo_totale}` : null,
    i.status ? `stato: ${i.status}` : null,
    i.descrizione ? `desc: ${String(i.descrizione).substring(0, 500)}` : null,
  ].filter(Boolean);
  return {
    content: parts.join(". "),
    metadata: {
      importo: i.importo_totale ?? null,
      status: i.status ?? null,
      data_scadenza: i.data_scadenza ?? null,
    },
  };
}

async function processIngest(
  supa: SupabaseClient,
  body: RequestBody,
): Promise<Response> {
  const limit = Math.min(body.limit ?? 200, 500);
  const since = body.since ?? "1970-01-01T00:00:00.000Z";
  const types = body.entity_types ?? ["customer", "order", "invoice"];
  let totalMarked = 0;
  const errors: string[] = [];

  // CUSTOMERS (profiles role_type=customer)
  if (types.includes("customer")) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supa as any)
        .from("profiles")
        .select("id, company_id, first_name, last_name, email, phone, city, indirizzo, note_pubbliche, created_at, updated_at")
        .eq("role_type", "customer")
        .gte("updated_at", since)
        .limit(limit);
      if (body.company_id) q = q.eq("company_id", body.company_id);
      const { data: customers, error } = await q;
      if (error) {
        errors.push(`customers: ${error.message}`);
      } else {
        for (const c of customers ?? []) {
          if (!c.company_id) continue;
          const { content, metadata } = await buildCustomerSummary(c);
          if (!content || content.length < 10) continue;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: rpcErr } = await (supa as any).rpc("mark_entity_for_embed", {
            p_company_id: c.company_id,
            p_entity_type: "customer",
            p_entity_id: c.id,
            p_content: content,
            p_metadata: metadata,
          });
          if (!rpcErr) totalMarked++;
        }
      }
    } catch (e) { errors.push(`customers crash: ${e instanceof Error ? e.message : e}`); }
  }

  // ORDERS
  if (types.includes("order")) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supa as any)
        .from("orders")
        .select("id, company_id, order_code, description, expected_date, total_amount, internal_notes, customer_id, updated_at")
        .gte("updated_at", since)
        .limit(limit);
      if (body.company_id) q = q.eq("company_id", body.company_id);
      const { data: orders, error } = await q;
      if (error) {
        errors.push(`orders: ${error.message}`);
      } else {
        for (const o of orders ?? []) {
          const { content, metadata } = await buildOrderSummary(o);
          if (!content || content.length < 10) continue;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: rpcErr } = await (supa as any).rpc("mark_entity_for_embed", {
            p_company_id: o.company_id,
            p_entity_type: "order",
            p_entity_id: o.id,
            p_content: content,
            p_metadata: metadata,
          });
          if (!rpcErr) totalMarked++;
        }
      }
    } catch (e) { errors.push(`orders crash: ${e instanceof Error ? e.message : e}`); }
  }

  // INVOICES (best effort, schema può variare)
  if (types.includes("invoice")) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supa as any)
        .from("invoices")
        .select("id, company_id, numero, data_emissione, importo_totale, data_scadenza, status, descrizione, updated_at")
        .gte("updated_at", since)
        .limit(limit);
      if (body.company_id) q = q.eq("company_id", body.company_id);
      const { data: invoices, error } = await q;
      if (error) {
        if (!error.message.includes("does not exist") && !error.message.includes("column")) {
          errors.push(`invoices: ${error.message}`);
        }
      } else {
        for (const inv of invoices ?? []) {
          const { content, metadata } = await buildInvoiceSummary(inv);
          if (!content || content.length < 10) continue;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: rpcErr } = await (supa as any).rpc("mark_entity_for_embed", {
            p_company_id: inv.company_id,
            p_entity_type: "invoice",
            p_entity_id: inv.id,
            p_content: content,
            p_metadata: metadata,
          });
          if (!rpcErr) totalMarked++;
        }
      }
    } catch (e) { errors.push(`invoices crash: ${e instanceof Error ? e.message : e}`); }
  }

  return new Response(JSON.stringify({
    mode: "ingest", types, marked_dirty: totalMarked, errors,
  }), { headers: { "Content-Type": "application/json" } });
}

// ════════════════════════════════════════════════════════════════════════════
// PROCESS: genera embedding per dirty entries
// ════════════════════════════════════════════════════════════════════════════

async function processProcess(
  supa: SupabaseClient,
  body: RequestBody,
): Promise<Response> {
  const limit = Math.min(body.limit ?? 30, 100);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: dirty, error } = await (supa as any).rpc(
    "list_dirty_entities_for_embed",
    { p_limit: limit },
  );
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }

  let processed = 0;
  let failed = 0;
  for (const e of (dirty ?? []) as DirtyEntity[]) {
    const emb = await generateEmbedding(e.content);
    if (!emb) { failed++; continue; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: markErr } = await (supa as any).rpc("mark_entity_embedded", {
      p_id: e.id,
      p_embedding: emb,
    });
    if (!markErr) processed++; else failed++;
  }

  return new Response(JSON.stringify({
    mode: "process", processed, failed,
    pending_remaining: (dirty?.length ?? 0) - processed - failed,
  }), { headers: { "Content-Type": "application/json" } });
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Auth: cron-secret OR service_role
  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = Deno.env.get("PROACTIVE_CRON_SECRET");
  const authHeader = req.headers.get("Authorization") ?? "";
  const isAuthorizedCron = cronSecret && expectedSecret && cronSecret === expectedSecret;
  const isServiceRole = authHeader.includes(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "_no_match_");
  if (!isAuthorizedCron && !isServiceRole) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const body = (await req.json().catch(() => ({}))) as RequestBody;
  if (body.mode === "ingest") {
    return await processIngest(supa, body);
  }
  return await processProcess(supa, body);
});
