/**
 * email-ai-embed-backfill — MP-EMAIL-AI-04 · Genera embedding per email storiche
 *
 * Batch background: prende email con embedding NULL (non personali), genera
 * l'embedding OpenAI (text-embedding-3-small, 1536) del oggetto+corpo e lo salva.
 * Idempotente: salta quelle già fatte. NON blocca l'UI.
 *
 * Endpoint POST: { company_id?: uuid, limit?: number } — x-cron-secret o super_admin.
 */

// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";

import { serveConMetricheRapida } from "../_shared/withMetricsRapida.ts";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const CRON_SECRET = Deno.env.get("PROACTIVE_CRON_SECRET") || "";

// A pg_net (i cron) si risponde entro pochi secondi: vedi _shared/rispostaRapidaCron.ts.
serveConMetricheRapida("email-ai-embed-backfill", async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);
  if (!OPENAI_API_KEY) return json({ error: "OPENAI_API_KEY missing" }, 500, cors);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    const body = await req.json();
    const cronAuth = req.headers.get("x-cron-secret");
    const isCron = CRON_SECRET && cronAuth === CRON_SECRET;
    if (!isCron) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return json({ error: "Auth required" }, 401, cors);
      const { data: u } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      if (!u.user) return json({ error: "Invalid token" }, 401, cors);
    }

    const limit = Math.min(body.limit || 50, 100);
    let q = supabase
      .from("email_inbox")
      .select("id, subject, raw_text, raw_html")
      .is("embedding", null)
      .eq("is_personale", false)
      .order("received_at", { ascending: false })
      .limit(limit);
    if (body.company_id) q = q.eq("company_id", body.company_id);

    const { data: rows, error } = await q;
    if (error) return json({ error: error.message }, 500, cors);
    if (!rows || rows.length === 0) return json({ processed: 0, embedded: 0 }, 200, cors);

    let embedded = 0;
    for (const e of rows) {
      const text = `${e.subject || ""}\n${stripHtml(e.raw_text, e.raw_html)}`.slice(0, 8000).trim();
      if (text.length < 10) continue;
      const emb = await generateEmbedding(text);
      if (!emb) continue;
      // pgvector: salva come STRING literal "[1,2,3]" (l'array raw non viene castato a vector)
      await supabase
        .from("email_inbox")
        .update({ embedding: `[${emb.join(",")}]` as any, embedding_at: new Date().toISOString() })
        .eq("id", e.id);
      embedded++;
    }

    return json({ processed: rows.length, embedded }, 200, cors);
  } catch (e) {
    console.error("[email-ai-embed-backfill] error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500, cors);
  }
});

function stripHtml(raw_text?: string | null, raw_html?: string | null): string {
  let b = (raw_text || "").trim();
  if (!b && raw_html) {
    b = raw_html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ").replace(/&[a-z]{2,8};/gi, " ").replace(/\s+/g, " ").trim();
  }
  return b;
}

async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    const resp = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.data?.[0]?.embedding || null;
  } catch { return null; }
}

function json(payload: any, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(payload), { status, headers: { ...headers, "Content-Type": "application/json" } });
}
